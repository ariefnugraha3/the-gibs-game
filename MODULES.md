# MODULES.md — Katalog Modul & Kontrak Antarmuka

> Peta lengkap setiap ES module di `src/`, ekspor pentingnya, dan kontrak antar-modul.
> **Gunakan file ini sebagai referensi — tidak perlu membuka setiap file untuk tahu apa yang tersedia di mana.**
> Konvensi: komentar kode Bahasa Indonesia, seluruh teks UI **English**. `THREE` adalah global (CDN r128, bukan import).

## Peta folder

```
index.html            DOM overlay + CDN scripts + <script type="module" src="src/main.js">
css/style.css         seluruh CSS
config/gameplay.json  SEMUA konstanta mekanik yang bisa di-tuning (lihat tabel di bawah)
src/
  main.js             entry: boot() -> menu -> startGame(mode) -> animate() loop
  core/               engine & orkestrasi (bukan gameplay spesifik mode)
  utils/              helper murni yang bisa dipakai di mana saja
  world/              elemen dunia BERSAMA antar scene (cahaya, langit, dekorasi, fasad gedung)
  entities/           sistem gameplay bersama (player, senjata, peluru, granat, zombie, drop, efek)
  scenes/             satu folder/file per scene; menambah stage = tambah file di scenes/campaign/
```

## Aturan arsitektur (WAJIB dipertahankan)

1. **State bersama = live binding ESM.** Modul pemilik meng-export `let` + fungsi setter; modul lain hanya membaca (mis. `isPaused` milik `core/state.js`, `stamina` milik `entities/player.js`, `currentWeapon` milik `entities/weapons.js`). Jangan menulis state modul lain secara langsung — panggil setter/fungsinya.
2. **Semua angka mekanik dari `CFG`** (`core/config.js`, dimuat dari `config/gameplay.json` SEBELUM game mulai). Baca `CFG.<seksi>.<kunci>` **di dalam fungsi**, jangan di top-level modul (config belum termuat saat modul dievaluasi). Jangan hardcode angka tuning baru — tambahkan kuncinya ke JSON.
3. **Sistem bersama tidak boleh tahu mode.** Tidak ada lagi `GAME_MODE`/`CAMP_STAGE` if-else di sistem bersama — semuanya lewat hook `activeScene.*` (kontrak scene di bawah). Kalau butuh perilaku baru per scene, tambahkan hook baru ke SEMUA scene, jangan if-else mode.
4. **Import silang antar modul boleh melingkar** (weapons↔player, zombies↔effects, stage1↔stage2, game↔input) **asal** binding hanya dipakai di dalam fungsi (call-time), tidak pernah di top-level.
5. **Urutan blok `updateGame()` di `core/game.js` = kontrak** (spawner → timer senjata → gerak player → recoil → tembak → granat → ledakan → darah → drop → peluru → zombie → cek menang). Jangan diubah tanpa alasan kuat.
6. Sisa aturan lama tetap berlaku: pool tetap (3 lampu ledakan, 14 sprite darah), material bersama jangan di-dispose, iterasi array entitas mundur, kalikan gerak dgn `step` & countdown dgn `dt`, dsb (lihat CLAUDE.md).

## KONTRAK ANTARMUKA SCENE

Scene = objek polos yang didaftarkan lewat `setScene(scene, opts)` (`core/sceneManager.js`).
Sistem bersama memanggil hook ini pada `activeScene` — **scene baru wajib mengimplementasikan semuanya**:

| Hook | Wajib | Dipanggil oleh | Tugas |
|---|---|---|---|
| `id` | ya | — | string unik, mis. `'campaign-3'` |
| `enter(opts)` | ya | sceneManager | bangun dunia (guard sekali), tempatkan entitas, posisi+arah kamera, preset cahaya |
| `exit()` | opsional | sceneManager | bersih-bersih saat meninggalkan scene |
| `updateMode(dt)` | opsional | game.updateGame | logika per-frame khas scene (wave spawner survival) |
| `playerCollide(pos, oldX, oldZ, feetY)` | ya | entities/player | dinding keras + penghalang pejal + (stage 1) trigger exit |
| `groundHeight(x, z, feetY)` | ya | player & grenades | ketinggian lantai yang bisa dipijak |
| `bulletBlocked(b)` → bool | ya | entities/bullets | peluru mati kena dinding dunia (Monas / dinding grid) |
| `grenadeCollide(g, oldGX, oldGZ)` | ya | entities/grenades | pantulan dinding/batas + resolve pejal + (stage 1) plafon |
| `zombieAI(z, dt, step)` → `{skip?}` / `{chaseDist?}` | ya | entities/zombies | gerak/aktivasi zombie; `skip`=lewati rig+hit test (idle jauh); `chaseDist`=jarak saat cabang kejar berjalan (syarat cakar) |
| `clampDropPos(x, z)` → `[x,z]` | ya | entities/drops | penjepit posisi drop |
| `hudStatus()` → string | ya | core/hud.updateUI | teks `#waveText` |
| `radarLandmarks(plot)` | ya | core/hud.drawRadar | `plot(dx, dz, color, size, clampEdge?)` relatif player; `clampEdge=true` = landmark di luar jangkauan dijepit ke tepi radar sbg penunjuk arah |
| `checkWin()` | opsional | game.updateGame | panggil `gameOver(true)` bila menang / transisi stage |
| `restartScene()` → scene | opsional | game.resetGame | scene tujuan saat restart setelah mati (campaign → selalu stage 1); tanpa ini restart di scene sendiri |
| `shopKey(key)` → bool | opsional | core/input keydown | shop survival: `'b'` buka/tutup; angka 1-5 membeli SAAT terbuka; return true = tombol DIKONSUMSI (tidak bocor ke ganti senjata) |
| `shopClose()` | opsional | core/input releaseInputs | tutup overlay shop saat unlock/blur/reset/game over |

### Cara menambah stage campaign baru (mis. Stage 4)

1. Buat `src/scenes/campaign/stage4.js` meniru pola `stage2.js` (dunia sendiri di offset jauh, mis. `x ≈ -30000`) ATAU pola `stage3.js` (memakai ulang dunia yang sudah ada + preset cahaya beda — jauh lebih murah): konfigurasi tata letak + `buildWorld()`/`ensure…()` + `placeZombies()` (pakai `spawnCampaignZombie(x, z, 4, kind?)`) + objek scene dgn semua hook (pakai `campaignZombieAI` dari `common.js` dgn `walkable`/`resolve`/`los?`/`nav` milik stage).
2. Dunia yang dibangun sejak awal campaign → panggil dari guard `built` di `stage1.enter()`; dunia yang dibangun lazy saat pertama masuk (pola stage 3) → guard di `enter()` sendiri, dan zombie ditempatkan di `enter()` (resetGame membuang semua zombie lebih dulu, jadi aman).
3. Arahkan transisi: scene sebelumnya men-trigger `setScene(stage4Scene, { transition: true })` (contoh nyata: `checkWin` stage 2 bertransisi ke stage 3 setelah boss tumbang). `enter()` stage baru membersihkan zombie stage sebelumnya (`z.stage === N-1`) seperti `stage2Scene.enter`/`stage3Scene.enter`.
4. Beri `restartScene: () => stage1Scene` dan `hudStatus()` dgn `countStageZombies(4)`.
5. Stage TERAKHIR yang memakai `checkWin()` → `gameOver(true)` (saat ini: stage 3).

## Katalog modul

### src/main.js
`boot()` (muat config → menu), `startGame(mode)` (urutan init lama: renderer → lights → qualityUI → effects → sky → setScene → embers → weapons → input → grain → UI → animate), loop `animate()` (dt clamp 0.05, `step = dt*60`, decor jalan saat pause, radar tiap 2 frame, composer/fallback render). Auto-boot kecuali `__GIBS_TEST__`.

### src/core/
- **config.js** — `CFG` (objek berisi seluruh gameplay.json), `CFG_BASE` (salinan MURNI hasil muat — tak pernah dimutasi), `CAMP_M = 7` (unit per meter), `loadConfig()` (fetch `config/gameplay.json`; test hook `__GIBS_CONFIG__`; validasi seksi — seksi baru WAJIB didaftarkan di array `SECTIONS`), `applyDifficulty(name)` (mutasi CFG dari CFG_BASE dgn pengali `CFG.difficulty[name]` — idempoten; dipanggil menu sebelum startGame; menyentuh: hp zombie survival/campaign/boss [dibulatkan], clawDamage semua varian+boss+monas, boomDamage, spawnInterval survival).
- **state.js** — status inti: `isPaused, isGameOver, score, mode, highScore, difficulty` (+ setter `setPaused/setGameOver/setScore/addScore/setMode/setHighScore/setDifficulty` — high score per difficulty: kunci `gibsHighScore_<diff>`, kunci lama fallback normal); `stats` (kills/headshots/shots/hits — per PELURU) + `resetStats()`; `player` (hp/ammo/mags/grenades/isReloading/lastShot/reloadTimer/reloadDurMs/speed/radius/vy/onGround + upgrade shop `dmgMul/reloadMul/upDmg/upReload`; senjata: rifle/pistol/shotgun) + `configurePlayer()` (stempel CFG + reset upgrade); `keys, mouse`; array entitas `bullets, zombies, grenades, explosions, drops`; resource bersama `GEO, MAT`; vektor scratch `_dir,_right,_tip,_v3,_sRight,_sUp,_kickEuler`; `clearArray(arr, scene)`.
- **dom.js** — semua ref elemen (`scoreText, ammoText, healthFill, grenadeText, waveText, blocker, gameOverScreen, finalScoreEl, bestScoreEl, gameOverTitle, crosshair, damageEl, staminaFill, stageMsgEl, radar, radarCtx`), `flashDamage()`, `showHitDir(relAngle)` (baji merah tepi layar diputar ke sudut penyerang — sudut dari `attackerAngle()` zombies.js; SATU elemen `#hitDir` di-reuse), `showPickup(text,color)`, `showStageMsg(text,dur)`, `hideStageMsg()`, `initGrain()`, `showFatal(html)`.
- **renderer.js** — `scene, camera, renderer, composer, bloomPass, fxaaPass, postFxOn, qualityTier, QUALITY[]`; `initRenderer()`, `onResize()`, `setFxaaRes()`, `applyQuality(t)`, `initQualityUI()`, `setQualityLightRef(dirLight)`. Kamera = badan player.
- **sceneManager.js** — `activeScene`, `setScene(scene, opts)` (exit lama → enter baru).
- **input.js** — `initInput()` (pointer lock + mouse look + klik + keyboard + blur + beforeunload; tombol senjata 1/2/3/Q; delegasi shop: tiap keydown ditawarkan dulu ke `activeScene.shopKey?.(key)` — true = dikonsumsi, digit tidak bocor jadi ganti senjata), `requestLock()`, `enterImmersive()` (fullscreen + Keyboard Lock `LOCK_KEYS` [termasuk KeyB & Digit1-5], tanpa Escape), `releaseInputs()` (juga memanggil `activeScene.shopClose?.()`).
- **hud.js** — `updateUI()` (skor/amunisi/health bar merah/granat + `activeScene.hudStatus()`); `radarProject(dx, dz, fx, fz, R, range)` (proyeksi heading-ke-atas: px = kanan-dunia, py = −depan-dunia — JANGAN dibalik, bug mirror lama sudah diperbaiki 2026-07-05); `drawRadar()` (radar kiri-atas: latar gelap polos + cincin jarak + silang + kerucut FOV + penanda N + blip glow + panah player; latar gradien & sweep berputar DIHAPUS atas permintaan user 2026-07-05 — jangan ditambahkan lagi; landmark `clampEdge` dijepit ke tepi; zombie & drops di-skip di luar jangkauan).
- **game.js** — `updateGame(dt, step, T)` (urutan kontrak), `gameOver(won, title?)` (English: MISSION COMPLETE / GAME OVER / judul kustom scene mis. THE MONUMENT HAS FALLEN; mengisi `#goStats` dari `stats`), `resetGame()` (reset skor+stats+player/senjata/entitas + `resetZombiesFx()` → `restartScene()` → `requestLock`).

### src/utils/
- **math.js** — `rand(a,b)`, `clamp(v,lo,hi)`, `smooth01(u)`, `segPointDist2(ax..pz)` (sweep peluru).
- **textures.js** — `makeTexture(w,h,draw,repX,repY)` (sRGB), `speckle(g,w,h,colors,n,sMin,sMax)`, `makeNormalMap(w,h,drawHeight,strength)` (linear), `noiseHeight(base,jitter,n,sMin,sMax)`.
- **sfx.js** — semua klip (`sfxShoot, sfxPistol, sfxExplode, sfxReload, sfxHit, sfxPickup, sfxMelee, sfxThrow, sfxNadeRoll, sfxZombieBite, sfxFootstep, sfxZombieStep`) + `playSFX(sfx, vol)` (pool 8 node per klip — selalu lewat ini).
- **collision.js** — `slideWalk(walkableFn, pos, oldX, oldZ, r)` (menyusur dinding per-sumbu), `resolveBlockers(pos, r, feetY, blockers)` (balok rotated-AABB `{x,z,hx,hz,axx,axz,azx,azz,rad,top,standable}`; return true bila kena balok standable), `blockersGroundHeight(x, z, feetY, blockers)`, `resolveCylinders(pos, r, cylinders)`.
- **pathfind.js** — pathfinder zombie (2026-07-06): `makeNavGrid(x0, z0, cell, cols, rows, sample)` (bake Uint8Array, sample dipanggil di pusat sel), `gridLOS(grid, x1, z1, x2, z2, rad?)` (garis-pandang grid setebal badan zombie), `findPath(grid, sx, sz, tx, tz)` (A* 8-arah + anti potong-sudut + string-pulling; null = tak tercapai/budget habis), `navAim(z, grid, tx, tz, dt, step)` (steering per-frame; return objek BERSAMA `{x, z, direct}` — jangan disimpan. LOS dicek TIAP frame: keputusan lurus-vs-path instan tanpa jeda timer, path dibuang begitu player terlihat; hanya findPath yang di-rate-limit `repathSec` + dipaksa saat macet `stuckSec`; maju waypoint juga saat waypoint berikutnya terlihat = string-pull runtime; status di `z.nav*`), `turnToward(z, desired, dt)` (heading laju-putar `turnRadPerSec` di `z.navHead` — gerak zombie memakai sudut ini agar menikung mulus). Grid null = seluruhnya nonaktif.

### src/world/ (bersama antar scene)
- **lighting.js** — `ambLight, hemiLight, dirLight, rimLight`; `createBaseLights(scene)`; `LIGHT_PRESETS` (`outdoor`/`indoor`/`night` [stage 3]) + `applyLightPreset(scene, name)` (uniform saja, tanpa recompile); `updateShadowFollow(camera)`.
- **decor.js** — registri animasi dekoratif (jalan juga saat pause): `waterJets[], fireSprites[]`, setter `setFlameLight/setFlameGlow/setBurningMat/setWaterTex/setSkyDome/setS1FlickerLight`, `updateWorldDecor(dt, T, camera)`.
- **sky.js** — `createSky(scene)` (kubah+bulan+halo, ikut player via decor), `createEmbers(scene)`, `updateEmbers(dt, T, camera)`.
- **facades.js** — resep gedung bersama (survival city & campaign): `CITY_PALETTE`, `makeFacadeTex()`, `makeLitTex()`, `makeCityMat(facade,lit)`, `makeBurningCityMat(facade)` (auto-daftar ke decor), `fillBuildingInstances(scene, list, mat)` (list `{x,z,w,d,h,ry,rz,color}`), `addFireSprites(scene, burnList)`.

### src/entities/ (sistem bersama)
- **player.js** — live: `stamina, staExhausted, sprintingNow, crouchedNow, eyeHCur`; `drainStamina(n)`, `toggleCrouch()`, `setCrouchHold(v)`, `clearCrouch()`, `tryJump()`, `resetPlayerState()`, `updatePlayerMovement(dt, step)` (bobot arah, stamina+bar, dorongan badan zombie ZBODY, `activeScene.playerCollide/groundHeight`, gravitasi/lompat, langkah kaki + langkah zombie global).
- **weapons.js** — live: `currentWeapon, isAiming, switchAnim, meleeT`; **`WEAPON_DEF`** (tabel definisi TIGA senjata — rifle/pistol/shotgun: name/hipX/hipY/adsY/baseZ/kick/muzzle/muzzleScale/kfBase + ref mesh & muzzlePoint diisi initWeapons; senjata baru = tambah baris + model + cabang rig reload); `initWeapons()` (model+tangan, parent kamera, `scene.add(camera)`; rifle = Pindad SS2-V2 serba hitam: carry handle berkanal bidik ADS, handguard berusuk, popor rangka, mag STANAG `MAG_REST`; shotgun = pump-action ber-magazen kotak `SG_MAG_REST`/pump `sgPump` — titik muzzle rifle tetap z −7.4), `attachMuzzle(wpn)` (def-driven), `startSwitch(t)`, `trySwitchKey(k)` (1/2/3; Q = `lastWeapon` — senjata SEBELUMNYA), `startReload()` (durasi = reloadMs × `player.reloadMul` upgrade shop, disimpan `player.reloadDurMs` — rig KF membaca ini agar sinkron), `tryMelee()`, `toggleAim()`, `setAiming(v)`, `doMeleeHit()`, `updateWeaponTimers(dt)` (switch swap di tengah: visibility 3 mesh + set lastWeapon), `updateWeaponState(dt)`, `updateShooting()` (spread kerucut kamera + kick + spawn peluru; `pellets` di CFG.weapons.<w> = peluru per tarikan [shotgun 7, sebar tambah `pelletSpread`]; arah dasar dibekukan sebelum kick; `stats.shots` per peluru; segmen frame-1 dari MATA), `updateWeaponVisuals(dt)` (ADS/FOV/bob per WEAPON_DEF; 3 cabang rig reload: rifle mag+bolt, shotgun mag+pump rack, pistol mag+slide; melee: pistol whip vs ayunan popor), `resetWeapons()`, `placeLimb(...)`.
- **bullets.js** — `updateBullets(step)` (maju, catat px/py/pz sweep, mati umur/`activeScene.bulletBlocked`).
- **grenades.js** — `NADE_R`, `buildGrenadeMesh(scale)` (Mk2; bahan bersama — JANGAN dispose), `handleThrowGrenade()`, `nudgeGrenade(g, px, pz, radius)` (pejal, cap `CFG.grenade.pushSpeed`), `updateGrenades(dt)` (fuse→ledak, integrasi, nudge player+zombie [boss dikecualikan — tidak bisa mem-bully granat], `activeScene.grenadeCollide/groundHeight`, pantul/gelinding/putar, sfx gelinding ≤90 unit).
- **zombies.js** — `ZOMBIE_VARIANTS, ZOMBIE_SKIN_TONES, CLAW_TIME`, `buildHumanZombie()` (`{group, rig}`), `tintZombie(group, dh, ds, dl, emissiveHex?)` (warnai varian — material per-instance, aman), `reachForScale(scl, base?)` (**PENTING**: reachMul utk zombie berskala — badan pejal `bodyBlockRadius×scl` mendorong player; tanpa ini brute/boss mendorong player keluar jangkauan cakarnya sendiri; scl 1 → tepat 1.0), `attackerAngle(ax, az)` (sudut penyerang relatif kamera utk `showHitDir`), `animateZombieRig(z, dt)`, `disposeZombie(z)`, `killZombie(i)` (puff+dispose+splice+skor [boss = `CFG.campaign.boss.score`] + `stats.kills` + exploder → antre ledakan), `resetZombiesFx()` (kosongkan antrean ledakan — dipanggil resetGame), `updateZombies(dt, step)` (loop bersama: `activeScene.zombieAI` → cakar bila `chaseDist` ada [damage `z.clawDmg`, jangkauan × `z.reachMul`, indikator arah] → rig → sweep hit peluru [radius/tinggi × `z.scl`; damage × `player.dmgMul`; headshot = kill instan KECUALI `z.noInstakill` boss → damage × `headshotDamageMul`; `stats.hits/headshots`] → `processPendingBooms` [ledakan exploder DI LUAR loop — anti bug splice reentrant; melukai player dlm `boomRadius`, ledakan berantai iteratif]). Field per-zombie varian: `kind, scl, clawDmg, reachMul, noInstakill, target` ('monas' survival).
- **drops.js** — `MEDKIT_MAT`, `MAG_GEO`, `MAG_MAT` (bersama, jangan dispose), `buildMedkitMesh()`, `buildMagMesh()` (Group magazen kurva: 3 segmen miring + alas + bibir + peluru brass — dipakai spawnDrop & supply stage 1; ganti balok kuning lama), `spawnDrop(pos)` (peluang CFG.drops + `activeScene.clampDropPos`), `updateDrops(dt, T)` (bob, pickup dgn aturan full-item + feed "already full" cd 1.2s, kedaluwarsa).
- **effects.js** — `initEffects(scene)` (pool 3 lampu + 14 sprite darah), `explodeAt(pos, radius?)` (visual + kill zombie dlm radius [default blast granat; exploder memakai `boomRadius`]; boss `noInstakill` menerima `grenadeDamage`, bukan kill instan), `spawnGroundPuff(x, z, color, scale, y)`, `spawnBlood(x, y, z)`, `updateExplosions(dt)`, `updateBloodPool(dt)`, `resetBloodPool()`.

### src/scenes/
- **menu.js** — `initMenu(onPick)`: kartu `#modeSelect` (`data-mode`) + baris `#diffRow` difficulty (localStorage `gibsDifficulty`; saat mode diklik → `applyDifficulty(diff)` + `setDifficulty(diff)` SEBELUM `onPick`) + cutscene 4 slide (hanya survival; campaign lompat ke blocker).
- **survival/world.js** — `PARK, FENCE_H, ROAD_W, FOUNTAIN, treeColliders`; `buildSurvivalWorld()` (ground/jalan/pagar/props/Monas/city); `buildSurvivalNav(fountainWalkable=true)` (nav-grid: Monas+pohon penghalang; bak walkable=vault survival / bak PEJAL utk stage 3 tanpa vault); **dunia taman DIBAGI dua scene**: `ensureParkWorld()` (bangun sekali), `getSurvivalNav()` (grid bak-walkable), `getParkNavSolidFountain()` (grid bak-pejal); `resolveObstacles(pos, r, feetY)` (pohon + bak; return true bila bak menghalangi = pemicu vault), `segmentHitsFountain(...)`, `groundHeightAt(x, z, feetY)`.
- **survival/index.js** — `survivalScene` (+hook `shopKey`/`shopClose` dari shop.js). Internal: `wave` (scaling `CFG.survival`), `spawnZombie()` (lompat pagar dua fase + roll VARIAN per wave [runner/brute/exploder] + `target:'monas'` peluang `monasAttackerChance`), `monasHp` (objektif: digerogoti penyerang monas via cooldown cakar yang sama; 0 → `gameOver(false,'THE MONUMENT HAS FALLEN')`; % di `hudStatus` & warna blip radar), `EVT` event wave (tiap `eventEveryWaves`: fog [animasi scene.fog.near/far] ATAU blackout [intensitas cahaya] — dihitung dari preset outdoor, dipulihkan `endEvent`/enter), `zombieAI` (jumping→chasing via `navAim` ke TARGET [player / tepi AABB Monas], vault bak mengikuti target; penggerogot monas return `{}` — tidak mencakar player).
- **survival/shop.js** — shop lapangan (tombol B, keyboard-only, pointer lock TETAP; game tidak pause): `shopKey(key)` ('b' buka/tutup; 1=restock ammo semua senjata, 2=medkit, 3=granat, 4=+damage `player.dmgMul` [max `damageMaxLevel`], 5=reload lebih cepat `player.reloadMul`; skor = mata uang via `addScore(-cost)`; ditolak bila penuh/maxed/skor kurang — skor utuh), `openShop/closeShop/isShopOpen`. Semua teks English.
- **campaign/common.js** — `spawnCampaignZombie(x, z, stage, kind='walker')` (idle; kind: walker/runner/brute/exploder [CFG.zombie.variants] / **boss** [CFG.campaign.boss — langsung chasing, `noInstakill`, skor khusus]; skala+tint per varian; `reachMul` via `reachForScale`), `campaignZombieAI(z, dt, step, {walkable, resolve, los?, nav?})` (culling `cullDistance`, aktivasi `activateMeters`×CAMP_M + LOS opsional/tembak; kejar via `navAim(nav)` + slide per-sumbu; stop-range × `z.reachMul`), `countStageZombies(n)`.
- **campaign/stage1.js** — `stage1Scene` (id `campaign-1`) + `S1, s1grid, s1Cell, S1_START, S1_EXIT, s1Wall, stage1Walk, s1LOS, s1SegHitsWall, resolve, s1Nav (nav-grid SETENGAH sel = 7 unit: dinding dari grid denah + furnitur/undakan di-bake via resolve — dibangun di AKHIR buildWorld setelah blockers terisi), buildWorld, placeZombies, placeSupplies`. Grid = satu-satunya sumber dinding (visual+kolisi+LOS+peluru). `enter()` = orkestrator campaign: build kedua stage (guard) + tempatkan SEMUA (stage2 zombies, stage1 zombies, supplies) + preset indoor + posisi start. Trigger `S1_EXIT` di `playerCollide` → `setScene(stage2Scene, {transition:true})`. Jika mengedit denah: jalankan ulang test BFS konektivitas (lihat bawah).
- **campaign/stage2.js** — `stage2Scene` (id `campaign-2`) + `CAMP, CAMP_DIR, CAMP_PERP, CAMP_START, highwayWalk, resolve, buildWorld, placeZombies`. Internal `navGrid` (bake di akhir buildWorld: koridor jalan+cincin+serong; median/mobil di-bake lewat resolve — path lewat celah median; lengan barat/timur di luar grid = fallback lurus) + **boss** (`bossSpawned/bossRef`: `checkWin` men-spawn boss saat sisa ≤ `spawnWhenRemaining` — TERMASUK lompatan langsung ke 0; HP bar boss di `hudStatus` [blok █░], `updateMode` me-refresh UI 0.2s selama boss hidup). `enter()` = pembersihan zombie stage 1 + reset boss + preset outdoor + teleport + stage msg. `checkWin`: boss tumbang & sisa 0 → `setScene(stage3Scene, {transition:true})`.
- **campaign/stage3.js** — `stage3Scene` (id `campaign-3`, FINAL) — "Taman Monas, Malam Hari": MEMAKAI ULANG dunia taman survival (`ensureParkWorld` + nav `getParkNavSolidFountain` — bak pejal, campaignZombieAI tak punya vault) + preset `night`. Zombie (campuran varian, `CFG.campaign.stage3Zombies`) ditempatkan di `enter()` (bukan orkestrator stage 1 — resetGame membuang zombie dulu, aman). Hook player/granat/peluru = pola survival (pagar clamp, AABB Monas, resolveObstacles). `checkWin`: `countStageZombies(3) === 0` → `gameOver(true)`. `restartScene` → stage1.

## config/gameplay.json — kunci tuning

| Seksi | Kunci |
|---|---|
| `player` | maxHp, speed, radius, eyeHeight, crouchDrop, jumpVelocity, gravity |
| `stamina` | max, sprintDrainPerSec, adsDrainPerSec, meleeCost, regenPerSec, recoverThreshold |
| `movement` | sprintMultiplier, crouchMultiplier, adsMultiplier, backpedalWeight, strafeWeight, walkSpreadPenalty, sprintSpreadPenalty |
| `weapons` | maxMags, bulletSpeed, bulletLife, bulletDamage, spreadBase, spreadBloom, heatPerShot, heatCoolPerSec, adsAccuracy, crouchAccuracy; per senjata (`rifle`/`pistol`/`shotgun`): magSize, startMags, fireDelayMs, reloadMs, cameraKick (+ shotgun: pellets, pelletSpread) |
| `melee` | range, cooldownSec |
| `grenade` | max, start, fuseSec, throwSpeed, throwUpward, killRadius, pushSpeed |
| `zombie` | headHeight, headshotRadius, bodyBlockRadius, clawDamage, clawCooldownSec, clawRange, stopRange, repathSec (rate-limit findPath), stuckSec (macet → repath paksa), turnRadPerSec (laju putar heading), variants.{runner,brute,exploder}.{hpMul,speedMul,scale,clawDamage} (+exploder boomRadius, boomDamage) |
| `survival` | waveSeconds, spawnIntervalBase/Step/Min, maxZombiesBase/Step/Cap, zombieHpBase, zombieHpPerTwoWaves, zombieSpeedBase/Rand/PerWave/Scale, runnerChanceBase/PerWave/Max, bruteFromWave+bruteChance, exploderFromWave+exploderChance, monasMaxHp, monasAttackerChance, monasDefendRadius, monasClawDamage, eventEveryWaves, eventDurationSec |
| `campaign` | zombieHp, zombieSpeedScale, activateMeters, cullDistance, stage3Zombies, boss.{hp,speed,scale,clawDamage,reachMul,spawnWhenRemaining,score,grenadeDamage,headshotDamageMul} |
| `drops` | magChance, grenadeChance, lifetimeSec, medkitHeal |
| `shop` | ammoCost, medkitCost+medkitHeal, grenadeCost, damageCost+damagePerLevel+damageMaxLevel, reloadCost+reloadPerLevel+reloadMaxLevel |
| `difficulty` | easy/normal/hard.{zombieHpMul, zombieDamageMul, spawnIntervalMul} — diterapkan `applyDifficulty()` dari CFG_BASE |

Catatan: animasi reload otomatis menyesuaikan `reloadMs` (keyframe diskalakan). Nilai visual murni (FOV, amplitudo animasi, warna) sengaja BUKAN di JSON.

## Menjalankan & menguji

- **Wajib HTTP server** (ES modules + fetch config tidak jalan di `file://`): `python -m http.server 8000` → `http://localhost:8000`. `index.html` menampilkan pesan error yang jelas bila dibuka via file://.
- `package.json` hanya metadata `{"type":"module"}` untuk tooling Node (`node --check src/**/*.js`) — tetap TANPA dependensi/build.
- Test headless (Node + stub THREE/DOM, menjalankan modul asli): harness ada di scratchpad sesi pengembangan (`rt/stubs.mjs`, `driver.mjs`, `test-survival.mjs`, `test-campaign.mjs`, `test-config.mjs`) — 61 assert meliputi gerak/pagar/spawner/tembak/cakar/stamina/granat/melee/pickup/lompat/BFS grid/aktivasi idle/wall-slide/peluru-vs-dinding/transisi stage/menang/restart/tuning config. Bila hilang, pola pembuatannya: stub `THREE` (Vector3/Quaternion/Euler matematika nyata, sisanya no-op), stub DOM/Audio/localStorage, set `__GIBS_TEST__` + `__GIBS_CONFIG__`, import `src/main.js`, panggil `boot()` + `startGame(mode)`, drive `updateGame(dt, step, T)` manual dgn `Date.now()` dipalsukan.
