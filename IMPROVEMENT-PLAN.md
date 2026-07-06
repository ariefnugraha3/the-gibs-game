# Rencana Improvement Gameplay

> Backlog fitur yang sudah disepakati arahnya bersama pemilik proyek (2026-07-06),
> ditulis agar AI/kontributor berikutnya bisa mengeksekusinya TANPA menggali ulang.
> Status: **belum ada yang dieksekusi.** Perbarui kolom Status + bagian "Log
> eksekusi" di bawah setiap kali satu item selesai.
>
> **WAJIB dibaca sebelum menyentuh kode: [MODULES.md](MODULES.md) (katalog modul +
> kontrak scene + resep tambah stage) dan [CLAUDE.md](CLAUDE.md) (aturan arsitektur).**
> Rencana port desktop/Steam terpisah di [STEAM-DESKTOP-PLAN.md](STEAM-DESKTOP-PLAN.md).

## Aturan besi (pelanggaran = PR ditolak)

1. **Semua teks yang dilihat pemain HARUS bahasa Inggris** (aturan permanen user,
   2026-07-05). Komentar kode tetap bahasa Indonesia.
2. **Tanpa build step / npm dependency / framework.** Situs statis; `package.json`
   tetap metadata-only. Harus jalan dari `python -m http.server 8000`.
3. **Perilaku per-mode lewat hook `activeScene.*`** — dilarang menambah if-else
   mode di sistem bersama (game.js, zombies.js, dst).
4. **Angka mekanik baru masuk `config/gameplay.json`** (lalu dibaca `CFG.x.y` DI
   DALAM fungsi). Menambah SEKSI baru di JSON? Daftarkan juga di array `SECTIONS`
   di `src/core/config.js`, kalau tidak boot akan gagal.
5. **Jangan menambah/menghapus PointLight saat gameplay berjalan** (recompile
   shader). Pakai pool yang ada atau buat saat build world.
6. **`#crosshair` tetap tersembunyi permanen** (CSS). Feedback tembakan/hit tidak
   boleh lewat crosshair.
7. **Urutan blok `updateGame()` adalah kontrak** — sisipkan sistem baru di posisi
   yang benar dan catat di MODULES.md.
8. Selesai mengerjakan apa pun: **update MODULES.md** (dan CLAUDE.md bila perlu),
   jalankan verifikasi (bagian paling bawah), dan JANGAN commit — user commit sendiri.

## Ringkasan prioritas

| # | Item | Prioritas | Perkiraan usaha | Status |
|---|------|-----------|-----------------|--------|
| 1 | Varian perilaku zombie (runner/brute/exploder) | P1 | Sedang | **SELESAI 2026-07-07** |
| 2 | Boss di akhir campaign stage 2 | P1 | Sedang | **SELESAI 2026-07-07** |
| 3 | Shop antar-wave (survival) | P2 | Sedang-besar | **SELESAI 2026-07-07** |
| 4 | Musik + ambience | P3 | Kecil (butuh aset dari user) | TODO (dikecualikan user) |
| 5 | Shotgun (senjata ke-3) | P4 | Besar (refactor weapons) | **SELESAI 2026-07-07** |
| 6 | Monas ber-HP (objektif survival) | P4 | Sedang | **SELESAI 2026-07-07** |
| 7 | Campaign Stage 3 (Monas malam hari) | P5 | Sedang | **SELESAI 2026-07-07** |
| 8 | Indikator arah serangan | P5 | Kecil | **SELESAI 2026-07-07** |
| 9 | Event wave (kabut / listrik padam) | P6 | Kecil-sedang | **SELESAI 2026-07-07** |
| 10 | Layar statistik akhir | P6 | Kecil | **SELESAI 2026-07-07** |
| 11 | Pilihan difficulty di start screen | P6 | Kecil | **SELESAI 2026-07-07** |
| 12 | Dukungan gamepad | P7 (fase Steam) | Sedang | TODO (dikecualikan user) |

Rekomendasi urutan pengerjaan sisa: item 4 (musik — minta aset ke user dulu) lalu
item 12 (gamepad, bersamaan fase Steam). Detail per-item di bawah TETAP berlaku
sebagai dokumentasi desain fitur yang sudah jadi.

---

## 1. Varian perilaku zombie

**Tujuan:** 6 varian zombie sekarang hanya beda tampilan; perilakunya identik.
Varian perilaku memaksa pemain memprioritaskan target.

**Desain:**
- Field baru saat spawn: `z.kind` = `'walker'` (default) | `'runner'` | `'brute'`
  | `'exploder'`, plus `z.clawDmg` (default `CFG.zombie.clawDamage`).
- Runner: HP 1, speed ×1.8, badan diperkecil (`mesh.scale.setScalar(0.92)`).
- Brute: HP ×4, speed ×0.6, `z.clawDmg` 2, badan ×1.25 (ingat: kepala ikut skala —
  hit test headshot pakai `CFG.zombie.headHeight`; untuk brute simpan
  `z.headH = headHeight * 1.25` dan pakai `z.headH || CFG.zombie.headHeight`
  di sweep peluru `zombies.js`).
- Exploder: HP 2, kulit kehijauan (tint material per-instance — `disposeZombie`
  sudah menangani material per-instance), MELEDAK saat mati.

**Peringatan reentrancy exploder:** JANGAN panggil `explodeAt()` di dalam
`killZombie()`/loop iterasi zombie (explodeAt mengiterasi & men-splice array
zombie yang sama → chain reaction di tengah iterasi = bug indeks). Pola aman:
tampung ke antrean modul (mis. `pendingBooms.push({x,y,z})`) lalu proses antrean
di `updateZombies` SETELAH loop utama, atau di blok explosions `updateGame`.

**Spawn:**
- Survival (`src/scenes/survival/index.js` → `spawnZombie`): peluang per kind naik
  per wave dari CFG, mis. `survival.runnerChanceBase 0.05 + runnerChancePerWave
  0.02` (cap 0.35), brute mulai wave 4, exploder mulai wave 6.
- Campaign (`src/scenes/campaign/common.js` → `spawnCampaignZombie`): tambah
  parameter opsional `kind`; penempatan eksplisit di daftar spawn stage (mis. 2
  brute menjaga ruang persediaan stage 1, beberapa runner di jalan raya stage 2).

**Config baru (seksi `zombie`, tambah sub-objek):**
```json
"variants": {
  "runner":  { "hpMul": 0.34, "speedMul": 1.8, "scale": 0.92, "clawDamage": 1 },
  "brute":   { "hpMul": 4,    "speedMul": 0.6, "scale": 1.25, "clawDamage": 2 },
  "exploder":{ "hpMul": 0.67, "speedMul": 1.1, "scale": 1.0,  "clawDamage": 1, "boomRadius": 28 }
}
```
(plus kunci peluang di seksi `survival`).

**Selesai bila:** headless test membuktikan (a) runner lebih cepat & mati 1 peluru,
(b) brute selamat dari 3 peluru badan tapi mati 1 headshot... **CATATAN: pemilik
proyek belum memutuskan apakah headshot tetap instan utk brute — tanyakan dulu;
default rencana: headshot instan TETAP berlaku kecuali boss**, (c) exploder yang
mati melukai player dalam radius & TIDAK crash saat 2 exploder berdekatan mati
bersamaan (test chain).

## 2. Boss campaign stage 2

**Tujuan:** kemenangan campaign sekarang datar (zombie habis = menang). Boss =
klimaks.

**Desain:**
- Trigger: saat sisa zombie stage 2 < 5, spawn boss di air mancur atas + panggil
  `showStageMsg('SOMETHING BIG IS COMING...')` (Inggris!). `checkWin` yang ada
  (array kosong → menang) otomatis mencakup boss — tidak perlu diubah.
- Boss = zombie `kind:'boss'`: scale ~2.4, HP dari CFG (mis. 60), speed rendah,
  `z.clawDmg` 3, `z.clawRangeMul` 1.8.
- **Headshot TIDAK instan utk boss** (kalau instan, boss mati 1 peluru): tambah
  flag `z.noInstakill = true`; di sweep peluru `zombies.js`, cabang headshot jadi
  `if (headshot) z.noInstakill ? (z.hp -= dmg * 3) : (z.hp = 0)`. Ini SATU-SATUNYA
  pengecualian aturan "headshot = instant kill" — dokumentasikan di CLAUDE.md.
- HP bar boss: JANGAN elemen DOM baru per-frame; pakai `#waveText` via
  `hudStatus()` stage 2: `Zombies Left: N — BOSS ██████░░`.
- Boss tidak kena pathfinder-budget masalah apa pun (dia zombie biasa dgn field
  beda). Nudge granat: kecualikan boss dari dorongan (`if (z.kind==='boss') skip`)
  supaya tidak bisa di-bully granat.

**Config:** seksi `campaign` tambah `boss: { hp, speed, scale, clawDamage,
spawnWhenRemaining }`.

**Selesai bila:** test campaign — bersihkan zombie sampai sisa 4 → boss muncul;
kill boss + sisa → `MISSION COMPLETE`.

## 3. Shop antar-wave (survival)

**Tujuan:** skor jadi mata uang → alasan bertahan "satu wave lagi".

**Desain interaksi (keyboard-only, TANPA melepas pointer lock):**
- Tombol `B` toggle overlay `#shopOverlay` (div baru di index.html, style di
  css/style.css). Game TETAP berjalan (tidak pause) — risiko dibuka saat dikejar
  adalah trade-off desainnya.
- Saat overlay terbuka, tombol angka 1–5 = beli. Semua teks Inggris, contoh:
  `[1] Refill Ammo — 400`, `[2] Medkit +2 HP — 300`, `[3] Grenade — 250`,
  `[4] +15% Damage (max 4) — 800`, `[5] Faster Reload -15% (max 3) — 700`,
  footer `Press B to close`.
- Beli: kurangi skor (`addScore(-cost)` dari `core/state.js`), efek langsung.
  Skor tidak cukup → baris merah + SFX gagal (pakai `playSFX(sfxPickup, 0.4)`
  atau tanpa suara; jangan tambah file audio hanya utk ini).

**Upgrade damage/reload — titik sambung:**
- Damage: `player.dmgMul` (baru, default 1, reset di `resetGame`). Terapkan di
  hit-test peluru `zombies.js`: `z.hp -= CFG.weapons.bulletDamage * (player.dmgMul||1)`.
- Reload: `player.reloadMul` diterapkan di `startReload` (`dur = reloadMs *
  player.reloadMul`) — **rig animasi otomatis ikut** karena keyframe di-skala ke
  durasi (lihat `updateWeaponVisuals`; pakai durasi efektif yang sama di kedua
  tempat, simpan `player.lastReloadDur` bila perlu).
- Ini upgrade PER-RUN (hilang saat reset) — jangan disimpan ke localStorage.

**Arsitektur:** shop khusus survival → taruh di `src/scenes/survival/shop.js`,
diinisialisasi dari `survivalScene.enter()`; handler keyboard didaftarkan di
`core/input.js` tapi mendelegasi ke `activeScene.shopKey?.(key)` (hook opsional
baru — catat di tabel kontrak MODULES.md). Campaign tidak punya hook itu = tombol
B mati di campaign. Overlay disembunyikan saat `releaseInputs()`/game over/reset.

**Config:** seksi BARU `shop` (ingat aturan besi #4: daftarkan di `SECTIONS`).

**Selesai bila:** test headless — buka shop (panggil hook langsung), beli medkit
mengurangi skor & menambah hp; skor kurang → tidak terjadi apa-apa; reset
mengembalikan `dmgMul`.

## 4. Musik + ambience

**Ketergantungan:** file audio belum ada — MINTA user menyediakan/menyetujui aset
dulu (`assets/sounds/music-ambient.mp3`, `music-combat.mp3`, loopable, ukuran
wajar). Jangan mengunduh aset sendiri tanpa persetujuan.

**Desain:**
- Modul baru `src/utils/music.js`: dua `Audio` loop (`loop = true`), volume 0.
  `startMusic()` dipanggil pertama kali dari gesture user yang sudah ada
  (`requestLock()` di `core/input.js` — kebijakan autoplay browser butuh gesture).
- Crossfade per-frame kecil di `updateWorldDecor` ATAU blok baru di `animate`
  (main.js): ambient default; layer combat menguat bila ada zombie `chasing`
  berjarak < ~200 unit — titik data ini SUDAH dihitung utk SFX langkah zombie
  global di `entities/player.js` (cari blok "langkah zombie global"); ekspor
  jarak terdekat itu daripada menghitung ulang.
- Volume master di CFG (`sfx`/seksi baru `audio`) + hormati mute bila nanti ada.
- Matikan/fade saat game over; reset di `resetGame`.

**Selesai bila:** manual browser: musik mulai setelah klik, layer combat naik
saat dikejar, tidak ada error autoplay di console saat load.

## 5. Shotgun (senjata ke-3) — KERJAKAN REFACTOR DULU

**Peringatan:** `weapons.js` penuh cabang biner `isRifle`/`currentWeapon ===
'rifle'` (posisi hip/ADS, kick, muzzle, KF reload, melee). Menambah senjata ke-3
tanpa refactor = ledakan ternary.

**Langkah 1 — refactor netral-perilaku:** buat tabel `WEAPON_DEF = { rifle: {...},
pistol: {...} }` berisi: mesh ref, muzzle ref, posisi hip (x,y,z), adsY, kick
visual, KF reload, fungsi rig reload, nama tampil. Ganti semua ternary dengan
lookup. **Jalankan seluruh test + cek manual sebelum lanjut** (nilai harus identik
byte-per-byte: hipX 3/2.6, hipY -2.5/-2.3, adsY -0.78/-0.7, baseZ -6/-5,
kick 2.5/1.6, skala muzzle sprite 1/0.75).

**Langkah 2 — shotgun:**
- `player.shotgun = { ammo, mags, magSize }` (configurePlayer di state.js),
  `CFG.weapons.shotgun`: magSize 6, startMags 2, fireDelayMs 900, reloadMs 2600,
  cameraKick 0.03, `pellets: 7`, `pelletSpread: 0.09`.
- `updateShooting`: bila senjata punya `pellets`, loop N peluru per tembakan
  (spread per pelet = pola yang sudah ada dgn radius `pelletSpread`; SATU
  `playSFX` & SATU kick kamera per tembakan, ammo -1 per tembakan).
- Tombol `3` di `trySwitchKey` + `initInput`; `Q` bersepeda rifle→pistol→shotgun?
  TIDAK — pertahankan Q = tukar 2 senjata terakhir (simpan `lastWeapon`).
- Model: pump-action sederhana (memakai pola mkPart rifle); reload pakai gaya
  magazine (BUKAN shell-by-shell — di luar cakupan; catat sbg utang).
- Drop mag: `'+1 Mag (All Weapons)'` — update teks & logika refill di drops.js.
- SFX: butuh `shotgun-shoot.mp3` dari user (fallback sementara: sfxShoot).

**Selesai bila:** test — 1 tembakan mengurangi 1 ammo & memunculkan 7 bullet;
switch 1/2/3/Q; reload; zombie dekat mati 1 tembakan (multi-pelet mengenai).

## 6. Monas ber-HP (survival)

**Desain:**
- `monasHp` (maks dari CFG, mis. 50) state di `survival/index.js`; reset di
  `enter()`.
- Sebagian spawn (`CFG.survival.monasAttackerChance` ~0.3) diberi `z.target =
  'monas'`: `zombieAI` mengejar titik tepi AABB Monas terdekat (bukan player);
  `navAim` menerima target (tx,tz) apa pun — SUDAH kompatibel. Sampai di tepi →
  pakai `attackCd` yang sama utk "menggerogoti" (`monasHp--`), animasi cakar tetap
  jalan (`z.clawT`). Return `{}` (bukan `{chaseDist}`) supaya tidak mencakar player.
- Zombie target-monas beralih ke player bila player < ~60 unit (biar tetap bisa
  dibela dgn badan).
- HUD: baris kecil di `hudStatus()`: `Wave 5 — Monas 78%` (paling murah, tanpa
  elemen baru). Di bawah 30% tambah peringatan `showPickup('The Monument is
  under attack!', '#ff6b6b')` dgn cooldown.
- `monasHp <= 0` → `gameOver(false)` + ganti teks overlay game over jadi
  `THE MONUMENT HAS FALLEN` (teks di `gameOver()` core/game.js menerima alasan?
  — tambahkan parameter opsional `reason` yang HANYA dipakai survival, default
  perilaku lama).
- Radar: blip Monas berubah warna sesuai hp (putih→merah).

**Selesai bila:** test — zombie target-monas mengurangi monasHp dan memicu game
over pada 0; zombie beralih ke player saat didekati.

## 7. Campaign Stage 3 — "Taman Monas, malam hari"

Ikuti **resep tambah stage di MODULES.md** + catatan khusus:
- Stage 3 MEMAKAI ULANG dunia survival (hemat besar): import `buildSurvivalWorld,
  buildSurvivalNav, resolveObstacles, segmentHitsFountain, groundHeightAt, PARK,
  FOUNTAIN` dari `src/scenes/survival/world.js`. Dunia survival ada di origin —
  aman berdampingan dgn stage 1/2 (x≈30000 & sekitarnya). Bangun dgn guard
  `built` yang SAMA dipakai survivalScene (pindahkan flag `built` + `navGrid` ke
  world.js agar dua scene berbagi; sekarang flag itu ada di survival/index.js).
- JANGAN masuk lewat `survivalScene.enter()` (itu mereset wave & posisi survival).
  Stage 3 = scene sendiri (`id: 'campaign-3'`) dgn `enter()` sendiri: teleport
  player ke gerbang taman, `showStageMsg('THE HIGHWAY LEADS HOME — CLEAR THE
  PARK')`, preset cahaya malam.
- Preset malam: tambah `night` di `LIGHT_PRESETS` (world/lighting.js) — HANYA
  mengubah intensitas/warna (aturan besi #5).
- Transisi: `stage2Scene.checkWin` sekarang `gameOver(true)`; ubah jadi pindah ke
  stage 3 (`setScene(stage3Scene, {transition:true})`), dan stage 3-lah yang
  `gameOver(true)`. Restart chain: `stage3.restartScene → stage1Scene` (campaign
  selalu restart dari stage 1 — kontrak lama).
- Zombie: `spawnCampaignZombie(x, z, 3)` tersebar di taman (rejection sampling
  seperti stage 2), campur varian item #1 bila sudah ada.
- Update test transisi ("stage 2 bersih → MISSION COMPLETE" akan berubah jadi
  "→ campaign-3") — SENGAJA breaking, perbarui testnya.

## 8. Indikator arah serangan

- Saat zombie mencakar player (blok cakar di `entities/zombies.js`, tempat
  `player.hp -=`), hitung sudut penyerang relatif hadap kamera:
  `rel = atan2(dx, dz) - yawKamera` → panggil `showHitDir(rel)` baru di
  `core/dom.js`.
- Implementasi murah: SATU div `#hitDir` lingkaran gradien merah berbentuk baji,
  `transform: rotate()` sesuai sudut, fade out 0.5 dtk via transition; JANGAN
  buat elemen per serangan.
- `flashDamage()` yang ada tetap (flash penuh), indikator ini pelengkap arah.

## 9. Event wave (kabut / listrik padam)

- Di `survivalScene.updateMode`: tiap N wave (CFG) pilih event acak berdurasi
  ~satu wave: (a) **Fog** — `scene.fog` HARUS sudah dibuat sejak init dgn nilai
  jauh/tak terlihat (mis. `new THREE.Fog(0x0a0f14, 4000, 8000)`), event hanya
  MENGANIMASIKAN near/far turun-naik. Membuat/menghapus fog saat runtime =
  recompile semua material (dilarang). (b) **Blackout** — pakai
  `applyLightPreset` varian gelap + kembalikan (uniform-only, aman).
- Umumkan dgn `showPickup('The fog is rolling in...', '#9fb6c9')` (Inggris).
- Radar tidak terpengaruh (dia kanvas 2D) — justru jadi lebih berguna saat kabut.

## 10. Layar statistik akhir

- Counter di `core/state.js`: `stats = { kills, headshots, shots, hits }` +
  `resetStats()`. Increment: `killZombie` (kills), cabang headshot zombies.js
  (headshots), `updateShooting` (shots), hit peluru (hits).
- Tampilkan di overlay game over (`gameOver()` core/game.js) — tambah elemen
  `#goStats` di index.html: `Kills 87 · Headshots 31 (36%) · Accuracy 42%`.
- Reset di `resetGame` via `resetStats()`.

## 11. Pilihan difficulty

- Start screen (menu.js / index.html): 3 tombol `EASY / NORMAL / HARD` di bawah
  kartu mode (pola `initQualityUI` di renderer.js — localStorage
  `gibsDifficulty`, default NORMAL).
- **Cara aman menerapkan:** `loadConfig()` menyimpan hasil fetch mentah ke
  `CFG_BASE` (deep copy). Saat mode dipilih (sebelum `startGame`), terapkan
  preset pengali ke salinan → `Object.assign(CFG, hasil)`. Pengali contoh:
  EASY zombie hp/claw ×0.75, spawn interval ×1.25; HARD kebalikannya. JANGAN
  mengalikan CFG berulang (idempoten: selalu dari CFG_BASE).
- Difficulty MENGUNCI leaderboard lokal? Simpan highscore per difficulty
  (`gibsHighScore_easy` dst) supaya adil.

## 12. Gamepad (fase Steam)

- Poll `navigator.getGamepads()` per frame (blok baru di `core/input.js`,
  dipanggil dari `updateGame` sebelum player movement).
- Mapping: stik kiri → `keys.w/a/s/d` (threshold 0.35), stik kanan → delta yaw/
  pitch (sensitivitas CFG), RT tembak (`mouse.isDown`), LT ADS, A lompat,
  B reload, X ganti senjata, RB granat, LB melee, stik kiri klik = sprint,
  stik kanan klik = crouch.
- Gotcha: mouse-look sekarang hanya jalan saat pointer-locked; jalur gamepad
  harus melewati euler YXZ yang SAMA (lihat `_kickEuler`/mouse-look di input.js)
  dan tidak butuh pointer lock → gate `beforeunload` & fullscreen perlu dicek
  ulang utk sesi gamepad murni.
- Kerjakan bersamaan dgn Fase 1 STEAM-DESKTOP-PLAN.md (Electron) agar diuji di
  target sebenarnya.

---

## Cara verifikasi (semua item)

1. `node --check src/<file>.js` utk tiap file yang diubah.
2. **Bangun ulang harness headless** sesuai pola yang didokumentasikan di bagian
   akhir MODULES.md (stub THREE bermatematika vektor asli + fake `Date.now`;
   harness lama hidup di scratchpad sesi sebelumnya dan TIDAK ikut repo).
   Minimal: suite survival, campaign, dan config-tuning hijau + test baru per item.
3. Uji manual browser kedua mode (`python -m http.server 8000`) — pathfinding,
   reload, ADS, radar, dan fitur baru.
4. Update MODULES.md (modul/ekspor/hook/kunci CFG baru) + tabel status di file ini.

## Log eksekusi

| Tanggal | Item | Hasil / catatan |
|---------|------|-----------------|
| 2026-07-07 | #1,2,3,5,6,7,8,9,10,11 (semua kecuali musik & gamepad) | Selesai satu gelombang; 106 check headless hijau (survival 57, campaign 38, config 11). Deviasi/catatan dari rencana: (a) **BUG DITEMUKAN & DIPERBAIKI**: badan pejal zombie berskala (`bodyBlockRadius×scl`) mendorong player keluar jangkauan cakar brute/boss — solusi `reachForScale(scl)` di zombies.js (invarian body<stop<claw dipertahankan di skala apa pun; scl 1 = 1.0 persis, perilaku lama utuh); (b) brute TETAP mati 1 headshot (default rencana; hanya boss `noInstakill`); (c) Q = tukar ke senjata SEBELUMNYA (`lastWeapon`), bukan siklus; (d) transisi menang stage 2 kini ke stage 3 (`checkWin` → setScene), MISSION COMPLETE pindah ke stage 3; (e) `explodeAt` diberi parameter radius opsional utk ledakan exploder; (f) reload upgrade memakai `player.reloadDurMs` agar rig KF & timer sinkron; (g) stub harness Material kini mengonversi hex→Color + emissive default (meniru THREE asli — dibutuhkan tintZombie). |
