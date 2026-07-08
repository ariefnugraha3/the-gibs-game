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

> **STATUS (2026-07-08): SUDAH DIIMPLEMENTASI & di-rework 2×.** Desain keyboard-only
> di bawah adalah rencana AWAL. Shop final = **menu KLIK modal** (game DI-PAUSE +
> pointer dilepas) dengan item Ammo / Grenade / Health / **Heal Monas** /
> **Strengthen Monas** / Shotgun / Assault Rifle (bukan upgrade damage/reload —
> field itu dorman). Lihat log 2026-07-07 (overhaul round-based) & 2026-07-08
> (menu klik + item Monas) dan MODULES.md `survival/shop.js`.

**Desain interaksi (rencana AWAL — keyboard-only, TANPA melepas pointer lock):**
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
| 2026-07-08 | Survival: radar jadi item shop 1500 (permintaan user) | Radar TIDAK lagi ada sejak awal di Survival — jadi item shop seharga `shop.radarCost`(1500). Flag baru `player.hasRadar` (state.js: literal true; `configurePlayer` set `!survivalStart` → Survival false, mode lain true). `hud.js`: `drawRadar` skip bila `!hasRadar`, `updateUI` sembunyikan/tampilkan kanvas `#radar` per flag. Item shop `radar` (shop.js catalog) set `player.hasRadar=true`; `ownedNote`→'Owned' setelah dibeli; visibilitas nyala lewat `updateUI` yang dipanggil `shopPurchase`. Campaign/mode lain tak berubah (radar tetap ada). Verifikasi: 152 check hijau (survival 103 [+mulai tanpa radar, +beli Radar → hasRadar & Owned; drawRadar-test diberi hasRadar=true], campaign 38, config 11). Belum di-commit. |
| 2026-07-08 | Base attack zombie 5 & base health 60 (permintaan user) | `CFG.zombie.clawDamage` 20→**5** (base/walker; SHARED survival+campaign) dan base HP **100→60** di `survival.zombieHpBase` + `campaign.zombieHp` (disamakan spt rebalance). Varian HP ikut turun otomatis (via `hpMul`: runner 60×0.34≈20, brute 240, exploder 40); **claw varian ABSOLUT tak ikut turun** (runner 20 / brute 40 / exploder 20 / monasClawDamage 20 / boss 60 tetap — kini jauh di atas base 5) — DITANDAI ke user bila mau diskalakan. Verifikasi: 149 check hijau (survival 100 [test cakar & HP dibuat config-driven → adaptif], campaign 38, config 11). Belum di-commit. |
| 2026-07-08 | Survival: speed zombie jadi ramp per-wave 60%→100% (perubahan rencana user) | Mengganti "speed = base penuh (seperti campaign)" (baris di bawah) dgn **ramp faktor wave**: wave 1 = 60% kecepatan penuh, +2% tiap wave, dijepit 100% (mentok ~wave 21). `spawnZombie` (index.js): `waveMul = min(zombieSpeedWaveMax, zombieSpeedWaveMin + (wave−1)×zombieSpeedWaveStep)`; `speed = (zombieSpeedBase + rand×zombieSpeedRand) × zombieSpeedScale × waveMul` (variasi acak & speedMul varian tetap dikali). Config baru `survival.zombieSpeedWaveMin`(0.6)/`zombieSpeedWaveStep`(0.02)/`zombieSpeedWaveMax`(1.0). "Kecepatan penuh" = base×scale (scale tetap 1). Verifikasi: 149 check hijau (survival 100 [test speed wave 1=60%, wave 11=80%, wave 30=cap 100% + HP cap tetap teruji di wave 1/11/30], campaign 38, config 11). Belum di-commit. |
| 2026-07-08 | Survival: Strengthen Monas jadi BERTINGKAT (permintaan user) | Item shop "Strengthen Monas" diubah dari "+20% max tiap beli" menjadi **tangga tetap**: base 1500 → 3000 → 4500 → 6000 (plafon) via config baru `survival.strengthenMonasStages`[3000,4500,6000]. `strengthenMonas()` (index.js) kini pakai `monasStage` scene-local (reset di `enter()`): set max ke `tiers[monasStage]`, +HP sebesar kenaikan max, `monasStage++`; di plafon → tolak ("already fully reinforced"). Export baru `isMonasFullyStrengthened()` → shop `ownedNote`→'Maxed' (tombol Buy mati) + pesan reject di `shopPurchase`. **Deskripsi item SENGAJA tanpa angka max HP** (permintaan user) — hanya info "reinforce the Monument ... up to its structural limit". Verifikasi: 146 check hijau (survival 97 [test strengthen bertingkat 3000/4500/6000 + reject plafon; heal test claw dinaikkan 500→2000 agar tak ter-cap di max 6000], campaign 38, config 11). Belum di-commit. |
| 2026-07-07 | #1,2,3,5,6,7,8,9,10,11 (semua kecuali musik & gamepad) | Selesai satu gelombang; 106 check headless hijau (survival 57, campaign 38, config 11). Deviasi/catatan dari rencana: (a) **BUG DITEMUKAN & DIPERBAIKI**: badan pejal zombie berskala (`bodyBlockRadius×scl`) mendorong player keluar jangkauan cakar brute/boss — solusi `reachForScale(scl)` di zombies.js (invarian body<stop<claw dipertahankan di skala apa pun; scl 1 = 1.0 persis, perilaku lama utuh); (b) brute TETAP mati 1 headshot (default rencana; hanya boss `noInstakill`); (c) Q = tukar ke senjata SEBELUMNYA (`lastWeapon`), bukan siklus; (d) transisi menang stage 2 kini ke stage 3 (`checkWin` → setScene), MISSION COMPLETE pindah ke stage 3; (e) `explodeAt` diberi parameter radius opsional utk ledakan exploder; (f) reload upgrade memakai `player.reloadDurMs` agar rig KF & timer sinkron; (g) stub harness Material kini mengonversi hex→Color + emissive default (meniru THREE asli — dibutuhkan tintZombie). |
| 2026-07-07 | **OVERHAUL Survival Mode (permintaan user)** | Survival diubah dari horde tanpa akhir (advance berbasis WAKTU) menjadi **round-based**: (1) mulai HANYA pistol + 3 mag (`player.owned` di state.js, di-set `configurePlayer` per `mode`); (2) wave 1 = 15 zombie (`zombiesPerWaveBase`+`Step`); (3) wave bersih → "WAVE CLEARED" + hitung mundur `shopCountdownSec` (3 dtk); (4) shop antar-gelombang auto-buka — item: Replenish All Ammo / Grenades / Health + Buy Shotgun / Buy Assault Rifle; (5) tombol Start Next Wave = SPACE. Implementasi: `wave.phase` state machine + `startWave/startNextWave` di `survival/index.js`; shop.js ditulis ulang (`shopBuyKey` + `buyWeapon`, item lama damage/reload-upgrade DIHAPUS — field `player.dmgMul/reloadMul` dibiarkan dorman = 1); `trySwitchKey` + `pickStartWeapon/applyStartLoadout` menghormati `player.owned`; mag drop hanya isi senjata dimiliki; input.js jaga SPACE (Next Wave) tak bocor jadi lompat; shop self-healing bila overlay tertutup Esc/blur (`updateMode` buka lagi di fase 'shopping'). Config: `survival` +`zombiesPerWaveBase/Step`+`shopCountdownSec` −`waveSeconds`, `spawnIntervalBase` 4→2.5; `shop` diganti `ammoCost/grenadeCost/healthCost/shotgunCost/rifleCost` (400/250/350/900/1200). Harga dikalibrasi thd ~1500 skor/wave-1 (kill = 100). Verifikasi: 125 check headless hijau (survival 76, campaign 38, config 11); campaign TAK tersentuh (semua senjata dimiliki). Belum ada yang di-commit (user commit sendiri). |
| 2026-07-07 | **REBALANCE damage/HP (permintaan user)** | Model "1 damage + headshot instan" → **model damage numerik**. Permintaan eksplisit: (1) zombie base HP 100 (variant `hpMul` TETAP → runner 34/brute 400/exploder 67); (2) **headshot = damage senjata × 2 (BUKAN instant-kill lagi)** via `zombie.headshotDamageMul`; (3) damage pistol 20 / shotgun 5-per-pelet / rifle 30 / granat 100; (4) player HP 100; (5) base claw zombie 20, cooldown 1 dtk; (6) kepala & badan zombie diperkecil lebarnya (tinggi tetap) agar sulit ditembak. Implementasi: per-senjata `CFG.weapons.<w>.damage` dibawa peluru (`b.damage` — senjata bisa berganti sebelum peluru kena; fallback `bulletDamage`); zombies.js hit-test pakai `b.damage` + `hsMul = z.noInstakill ? boss.headshotDamageMul(3) : zombie.headshotDamageMul(2)`, radius badan `CFG.zombie.bodyHitRadius`(6→5) & `headshotRadius`(2.4→1.6); geometri `ZG.head` 2.4→1.8 & `ZG.torso` 3.8→3.4 (tinggi 4.6 tetap), bahu ±2.45→±2.3; `grenade.damage`(100) di effects.js (boss tetap pakai `boss.grenadeDamage`). **Nilai TURUNAN diskala proporsional** (user tak sebut, tapi wajib agar balance tak pecah — DITANDAI ke user): campaign `zombieHp` 3→100, `boss.hp` 60→1800 (×30 = jumlah tembakan sama), `boss.clawDamage` 3→60, `boss.grenadeDamage` 10→300; claw varian ×20 (brute 40, runner/exploder/monas 20), `exploder.boomDamage` 2→40. Melee TETAP instant-kill (di luar cakupan — ditandai). Verifikasi: 127 check headless hijau (survival 78 [+2 test headshot ×2 deterministik dgn sebar dimatikan], campaign 38, config 11). Belum di-commit (user commit sendiri). |
| 2026-07-07 | Shotgun headshot ×4 (permintaan user) | Pengali headshot **per-senjata**: `CFG.weapons.<w>.headshotMul` (shotgun 4) di-stempel ke peluru (`b.headshotMul`); zombies.js: `hsMul = b.headshotMul != null ? b.headshotMul : (boss ? boss.headshotDamageMul : zombie.headshotDamageMul)` — nilai senjata MENANG bila ada (shotgun 4× per pelet, termasuk vs boss), rifle/pistol tetap pakai default zombie 2× (boss 3×). Verifikasi: 128 check hijau (survival 79 [+1 test shotgun 7 pelet ×5 ×4 = 140, sebar & pelletSpread dimatikan utk determinisme], campaign 38, config 11). Belum di-commit. |
| 2026-07-07 | Survival: prioritas Monas + aggro 20 m + skor per jenis (permintaan user) | (1)+(2) **Prioritas Monas + aggro jarak**: semua zombie survival serang Monas secara default; `atkMonas = monasHp>0 && distToEye > CFG.survival.playerAggroMeters(20)·CAMP_M(7)` = 140 unit — kejar player hanya bila player ≤20 m dari zombie, kembali ke Monas bila lewat. Menghapus `z.target` statis + `monasAttackerChance` + `monasDefendRadius`(60); tambah `survival.playerAggroMeters`(20). (3) **Skor per jenis + headshot**: `killZombie(i, headshot)` + `zombieScore()` baca `CFG.zombie.score` {normalKill 100, normalHeadshot 150, specialKill 150, specialHeadshot 200} (special = varian runner/brute/exploder; boss tetap `boss.score`); hit-test peluru meneruskan `isHead`, melee/granat = false. Verifikasi: 134 check hijau (survival 85 [+test aggro via `zombieAI` return {} vs {chaseDist}, +4 test skor via `killZombie(i,hs)`], campaign 38, config 11). Perbaikan test lama: pathfinder-around-Monas dipindah player ke ≤140 unit agar zombie ter-aggro; test shotgun diberi reset kamera eksplisit (dulu diam-diam mengandalkan kamera (0,120) — di (0,40) peluru masuk AABB Monas → bulletBlocked). Belum di-commit. |
| 2026-07-08 | Survival: cap HP wave +50% & speed = base (seperti campaign) (permintaan user) | (1) **HP dijepit +50% base**: `spawnZombie` HP kini `Math.min(zombieHpBase × zombieHpMaxMul, zombieHpBase + floor((wave−1)/2)×zombieHpPerTwoWaves)` — config baru `survival.zombieHpMaxMul`(1.5). Varian `hpMul` tetap dikali DARI base yang sudah di-cap (brute maks = round(150×4)=600). (2) **Speed normal = base (seperti campaign)**: hapus term ramp `+(wave−1)×zombieSpeedPerWave` & set `zombieSpeedScale` 0.3→1 → formula survival kini identik campaign `(zombieSpeedBase + rand×zombieSpeedRand) × zombieSpeedScale` (0.6–1.0; walker tak lagi dilambatkan 0.3× & tak dipercepat per-wave). Hapus kunci `survival.zombieSpeedPerWave`. Varian `speedMul` tetap. Verifikasi: 143 check hijau (survival 94 [+test spawner wave-3: hp = round(base×1.5), speed = base×scale — varian dimatikan & rand=0 utk determinisme], campaign 38, config 11). Catatan: dgn ramp `zombieHpPerTwoWaves`=1, cap +50% baru tercapai ~wave 101 (cap = plafon keras, bukan target cepat). Belum di-commit. |
| 2026-07-08 | SFX senjata: shotgun / klik kosong / ganti senjata (permintaan user) | Tiga klip baru di `utils/sfx.js` (`sfxShotgun`/`sfxEmpty`/`sfxSwitch`) diwiring di `weapons.js`: (1) `updateShooting` memilih `sfxShotgun` untuk shotgun (rifle `sfxShoot`/pistol `sfxPistol` tetap); (2) `sfxEmpty` "cekrek" saat pelatuk ditarik tapi `ammo===0 && mags===0` — SEKALI per tarikan via flag modul `emptyReady` (di-arm ulang saat mouse dilepas; cabang `else if` jadi tak dobel dgn tembakan terakhir); (3) `sfxSwitch` di `startSwitch` (ganti senjata, bukan saat spawn/reset). Aset `assets/sounds/{shotgun-shot,empty-gun,switch-weapon}.mp3` (untracked — user `git add`). Verifikasi: 140 check hijau (survival 91 [+test klik-kosong: tak ada peluru saat habis], campaign 38, config 11). Belum di-commit. |
| 2026-07-08 | Survival: shop → MENU KLIK modal + item Monas (permintaan user) | **Shop keyboard-only → menu KLIK modal**: game DI-PAUSE + pointer dilepas selama shop terbuka (dunia tetap dirender di belakang). `shop.js` ditulis ulang data-driven: `catalog()` {id,name,desc,cost,apply()} + `shopPurchase(id)` (dipakai handler klik DOM & test); `render()` pakai `createElement` — kiri daftar item (hover→detail), kanan nama/deskripsi/harga+tombol Buy, bawah-kiri Score, bawah-kanan Start Next Wave. **2 item BARU**: Heal Monas (+25% max HP, tolak bila penuh) & Strengthen Monas (+20% max HP permanen/run + heal sebesar itu) — `monasHp`/`monasMaxHp` dijadikan scene-local (max di-reset dari CFG di `enter()`), fungsi `healMonas`/`strengthenMonas`/`getMonasHp`/`getMonasMaxHp` diexport, shop.js impor `healMonas`/`strengthenMonas`/`startNextWave` dari index.js (circular, dalam fungsi). **input.js**: hook baru `activeScene.shopActive()` → keydown menelan semua tombol gameplay (hanya SPACE/Enter = Next Wave) & `pointerlockchange` unlock mem-pause TANPA blocker; `releaseInputs` TIDAK lagi menutup shop; `startNextWave` menutup shop lalu `requestLock()` untuk resume (dari gesture klik/SPACE). Hapus `shopBuyKey` + hook `shopClose`. Config `shop` +`healMonasCost`(300)+`strengthenMonasCost`(500). CSS `#shopOverlay` ditulis ulang (backdrop full-screen + panel 2 kolom + footer). Verifikasi: **139 check hijau** (survival 90 [shop via `shopPurchase`, +test Strengthen/Heal Monas via getter], campaign 38, config 11). Belum di-commit (user commit sendiri). |
