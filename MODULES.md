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
| `checkWin()` | opsional | game.updateGame | panggil `gameOver(true)` bila menang |
| `restartScene()` → scene | opsional | game.resetGame | scene tujuan saat restart setelah mati (campaign → selalu stage 1); tanpa ini restart di scene sendiri |

### Cara menambah stage campaign baru (mis. Stage 3)

1. Buat `src/scenes/campaign/stage3.js` meniru pola `stage2.js`: konfigurasi tata letak + `buildWorld()` + `placeZombies()` (pakai `spawnCampaignZombie(x, z, 3)`) + objek scene dgn semua hook (pakai `campaignZombieAI` dari `common.js` dgn `walkable`/`resolve`/`los?` milik stage). Taruh dunianya di offset kosong yang jauh (mis. `x ≈ -30000`) supaya tidak tumpang tindih.
2. Panggil `buildWorld()`-nya dari guard `built` di `stage1.enter()` dan `placeZombies()`-nya dari blok penempatan yang sama (semua penempatan campaign terjadi saat masuk/restart stage 1).
3. Arahkan transisi: scene sebelumnya men-trigger `setScene(stage3Scene, { transition: true })` (contoh: trigger rect di `playerCollide` stage 1, atau ganti `checkWin` stage 2 menjadi transisi). `enter()` stage 3 membersihkan zombie stage sebelumnya (`z.stage === N-1`) seperti `stage2Scene.enter`.
4. Beri `restartScene: () => stage1Scene` dan `hudStatus()` dgn `countStageZombies(3)`.
5. Update HUD win: stage TERAKHIR yang memakai `checkWin()` → `gameOver(true)`.

## Katalog modul

### src/main.js
`boot()` (muat config → menu), `startGame(mode)` (urutan init lama: renderer → lights → qualityUI → effects → sky → setScene → embers → weapons → input → grain → UI → animate), loop `animate()` (dt clamp 0.05, `step = dt*60`, decor jalan saat pause, radar tiap 2 frame, composer/fallback render). Auto-boot kecuali `__GIBS_TEST__`.

### src/core/
- **config.js** — `CFG` (objek berisi seluruh gameplay.json), `CAMP_M = 7` (unit per meter), `loadConfig()` (fetch `config/gameplay.json`; test hook `__GIBS_CONFIG__`; validasi seksi).
- **state.js** — status inti: `isPaused, isGameOver, score, mode, highScore` (+ setter `setPaused/setGameOver/setScore/addScore/setMode/setHighScore`); `player` (hp/ammo/mags/grenades/isReloading/lastShot/reloadTimer/speed/radius/vy/onGround) + `configurePlayer()` (stempel CFG); `keys, mouse`; array entitas `bullets, zombies, grenades, explosions, drops`; resource bersama `GEO, MAT` (bullet/grenade/explosion/dropNade/ring — mesh mag pindah ke `buildMagMesh()` di drops.js); vektor scratch `_dir,_right,_tip,_v3,_sRight,_sUp,_kickEuler`; `clearArray(arr, scene)`.
- **dom.js** — semua ref elemen (`scoreText, ammoText, healthFill, grenadeText, waveText, blocker, gameOverScreen, finalScoreEl, bestScoreEl, gameOverTitle, crosshair, damageEl, staminaFill, stageMsgEl, radar, radarCtx`), `flashDamage()`, `showPickup(text,color)`, `showStageMsg(text,dur)`, `hideStageMsg()`, `initGrain()`, `showFatal(html)`.
- **renderer.js** — `scene, camera, renderer, composer, bloomPass, fxaaPass, postFxOn, qualityTier, QUALITY[]`; `initRenderer()`, `onResize()`, `setFxaaRes()`, `applyQuality(t)`, `initQualityUI()`, `setQualityLightRef(dirLight)`. Kamera = badan player.
- **sceneManager.js** — `activeScene`, `setScene(scene, opts)` (exit lama → enter baru).
- **input.js** — `initInput()` (pointer lock + mouse look + klik + keyboard + blur + beforeunload), `requestLock()`, `enterImmersive()` (fullscreen + Keyboard Lock `LOCK_KEYS`, tanpa Escape), `releaseInputs()`.
- **hud.js** — `updateUI()` (skor/amunisi/health bar merah/granat + `activeScene.hudStatus()`); `radarProject(dx, dz, fx, fz, R, range)` (proyeksi heading-ke-atas: px = kanan-dunia, py = −depan-dunia — JANGAN dibalik, bug mirror lama sudah diperbaiki 2026-07-05); `drawRadar()` (radar kiri-atas: latar gelap polos + cincin jarak + silang + kerucut FOV + penanda N + blip glow + panah player; latar gradien & sweep berputar DIHAPUS atas permintaan user 2026-07-05 — jangan ditambahkan lagi; landmark `clampEdge` dijepit ke tepi; zombie & drops di-skip di luar jangkauan).
- **game.js** — `updateGame(dt, step, T)` (urutan kontrak), `gameOver(won)` (English: MISSION COMPLETE / GAME OVER), `resetGame()` (reset player/senjata/entitas → `restartScene()` → `requestLock`).

### src/utils/
- **math.js** — `rand(a,b)`, `clamp(v,lo,hi)`, `smooth01(u)`, `segPointDist2(ax..pz)` (sweep peluru).
- **textures.js** — `makeTexture(w,h,draw,repX,repY)` (sRGB), `speckle(g,w,h,colors,n,sMin,sMax)`, `makeNormalMap(w,h,drawHeight,strength)` (linear), `noiseHeight(base,jitter,n,sMin,sMax)`.
- **sfx.js** — semua klip (`sfxShoot, sfxPistol, sfxExplode, sfxReload, sfxHit, sfxPickup, sfxMelee, sfxThrow, sfxNadeRoll, sfxZombieBite, sfxFootstep, sfxZombieStep`) + `playSFX(sfx, vol)` (pool 8 node per klip — selalu lewat ini).
- **collision.js** — `slideWalk(walkableFn, pos, oldX, oldZ, r)` (menyusur dinding per-sumbu), `resolveBlockers(pos, r, feetY, blockers)` (balok rotated-AABB `{x,z,hx,hz,axx,axz,azx,azz,rad,top,standable}`; return true bila kena balok standable), `blockersGroundHeight(x, z, feetY, blockers)`, `resolveCylinders(pos, r, cylinders)`.
- **pathfind.js** — pathfinder zombie (2026-07-06): `makeNavGrid(x0, z0, cell, cols, rows, sample)` (bake Uint8Array, sample dipanggil di pusat sel), `gridLOS(grid, x1, z1, x2, z2, rad?)` (garis-pandang grid setebal badan zombie), `findPath(grid, sx, sz, tx, tz)` (A* 8-arah + anti potong-sudut + string-pulling; null = tak tercapai/budget habis), `navAim(z, grid, tx, tz, dt, step)` (steering per-frame; return objek BERSAMA `{x, z, direct}` — jangan disimpan. LOS dicek TIAP frame: keputusan lurus-vs-path instan tanpa jeda timer, path dibuang begitu player terlihat; hanya findPath yang di-rate-limit `repathSec` + dipaksa saat macet `stuckSec`; maju waypoint juga saat waypoint berikutnya terlihat = string-pull runtime; status di `z.nav*`), `turnToward(z, desired, dt)` (heading laju-putar `turnRadPerSec` di `z.navHead` — gerak zombie memakai sudut ini agar menikung mulus). Grid null = seluruhnya nonaktif.

### src/world/ (bersama antar scene)
- **lighting.js** — `ambLight, hemiLight, dirLight, rimLight`; `createBaseLights(scene)`; `LIGHT_PRESETS` (`outdoor`/`indoor`) + `applyLightPreset(scene, name)` (uniform saja, tanpa recompile); `updateShadowFollow(camera)`.
- **decor.js** — registri animasi dekoratif (jalan juga saat pause): `waterJets[], fireSprites[]`, setter `setFlameLight/setFlameGlow/setBurningMat/setWaterTex/setSkyDome/setS1FlickerLight`, `updateWorldDecor(dt, T, camera)`.
- **sky.js** — `createSky(scene)` (kubah+bulan+halo, ikut player via decor), `createEmbers(scene)`, `updateEmbers(dt, T, camera)`.
- **facades.js** — resep gedung bersama (survival city & campaign): `CITY_PALETTE`, `makeFacadeTex()`, `makeLitTex()`, `makeCityMat(facade,lit)`, `makeBurningCityMat(facade)` (auto-daftar ke decor), `fillBuildingInstances(scene, list, mat)` (list `{x,z,w,d,h,ry,rz,color}`), `addFireSprites(scene, burnList)`.

### src/entities/ (sistem bersama)
- **player.js** — live: `stamina, staExhausted, sprintingNow, crouchedNow, eyeHCur`; `drainStamina(n)`, `toggleCrouch()`, `setCrouchHold(v)`, `clearCrouch()`, `tryJump()`, `resetPlayerState()`, `updatePlayerMovement(dt, step)` (bobot arah, stamina+bar, dorongan badan zombie ZBODY, `activeScene.playerCollide/groundHeight`, gravitasi/lompat, langkah kaki + langkah zombie global).
- **weapons.js** — live: `currentWeapon, isAiming, switchAnim, meleeT`; `initWeapons()` (model+tangan, parent kamera, `scene.add(camera)`), `attachMuzzle(wpn)`, `startSwitch(t)`, `trySwitchKey(k)`, `startReload()`, `tryMelee()`, `toggleAim()`, `setAiming(v)`, `doMeleeHit()`, `updateWeaponTimers(dt)` (switch swap di tengah + melee hit 45%), `updateWeaponState(dt)` (recoil/heat decay + posisi z), `updateShooting()` (spread kerucut kamera + kick + spawn peluru; segmen frame-1 dari MATA), `updateWeaponVisuals(dt)` (ADS/FOV/bob/rig reload KF diskalakan reloadMs/melee/forearm), `resetWeapons()`, `placeLimb(...)`.
- **bullets.js** — `updateBullets(step)` (maju, catat px/py/pz sweep, mati umur/`activeScene.bulletBlocked`).
- **grenades.js** — `NADE_R`, `buildGrenadeMesh(scale)` (Mk2; bahan bersama — JANGAN dispose), `handleThrowGrenade()`, `nudgeGrenade(g, px, pz, radius)` (pejal, cap `CFG.grenade.pushSpeed`), `updateGrenades(dt)` (fuse→ledak, integrasi, nudge player+zombie, `activeScene.grenadeCollide/groundHeight`, pantul/gelinding/putar, sfx gelinding ≤90 unit).
- **zombies.js** — `ZOMBIE_VARIANTS, ZOMBIE_SKIN_TONES`, `buildHumanZombie()` (`{group, rig}`), `animateZombieRig(z, dt)`, `disposeZombie(z)` (material per-instance + array kepala), `killZombie(i)` (puff+dispose+splice+skor), `updateZombies(dt, step)` (loop bersama: `activeScene.zombieAI` → cakar bila `chaseDist` ada → rig → sweep hit peluru; headshot `CFG.zombie.headHeight/headshotRadius` = kill instan; tertembak = idle bangun; tanpa umpan-balik luka by design).
- **drops.js** — `MEDKIT_MAT`, `MAG_GEO`, `MAG_MAT` (bersama, jangan dispose), `buildMedkitMesh()`, `buildMagMesh()` (Group magazen kurva: 3 segmen miring + alas + bibir + peluru brass — dipakai spawnDrop & supply stage 1; ganti balok kuning lama), `spawnDrop(pos)` (peluang CFG.drops + `activeScene.clampDropPos`), `updateDrops(dt, T)` (bob, pickup dgn aturan full-item + feed "already full" cd 1.2s, kedaluwarsa).
- **effects.js** — `initEffects(scene)` (pool 3 lampu + 14 sprite darah), `explodeAt(pos)` (visual + kill radius CFG), `spawnGroundPuff(x, z, color, scale, y)`, `spawnBlood(x, y, z)`, `updateExplosions(dt)`, `updateBloodPool(dt)`, `resetBloodPool()`.

### src/scenes/
- **menu.js** — `initMenu(onPick)`: kartu `#modeSelect` (`data-mode`) + cutscene 4 slide (hanya survival; campaign lompat ke blocker).
- **survival/world.js** — `PARK, FENCE_H, ROAD_W, FOUNTAIN, treeColliders`; `buildSurvivalWorld()` (ground/jalan/pagar/props/Monas/city); `buildSurvivalNav()` (nav-grid pathfinder: Monas+pohon penghalang, bak SENGAJA walkable agar vault tetap terpicu — panggil setelah buildSurvivalWorld); `resolveObstacles(pos, r, feetY)` (pohon + bak; return true bila bak menghalangi = pemicu vault), `segmentHitsFountain(...)`, `groundHeightAt(x, z, feetY)`.
- **survival/index.js** — `survivalScene`. Internal: `wave` (scaling dari `CFG.survival`), `spawnZombie()` (lompat pagar dua fase), `zombieAI` (jumping→chasing via `navAim` [lurus bila LOS grid bebas, waypoint bila terhalang Monas/pohon], AABB Monas, vault bak; `chaseDist` hanya dari cabang kejar — zombie yang baru mendarat tidak mencakar frame itu).
- **campaign/common.js** — `spawnCampaignZombie(x, z, stage)` (idle, hp/speed CFG.campaign, tag `z.stage`), `campaignZombieAI(z, dt, step, {walkable, resolve, los?, nav?})` (culling `cullDistance`, aktivasi `activateMeters`×CAMP_M + LOS opsional/tembak; kejar via `navAim(nav)` [tanpa nav = selalu lurus] + slide per-sumbu; zombie baru aktif langsung bisa mencakar frame itu), `countStageZombies(n)`.
- **campaign/stage1.js** — `stage1Scene` (id `campaign-1`) + `S1, s1grid, s1Cell, S1_START, S1_EXIT, s1Wall, stage1Walk, s1LOS, s1SegHitsWall, resolve, s1Nav (nav-grid = grid denah, dibangun di buildWorld), buildWorld, placeZombies, placeSupplies`. Grid = satu-satunya sumber dinding (visual+kolisi+LOS+peluru). `enter()` = orkestrator campaign: build kedua stage (guard) + tempatkan SEMUA (stage2 zombies, stage1 zombies, supplies) + preset indoor + posisi start. Trigger `S1_EXIT` di `playerCollide` → `setScene(stage2Scene, {transition:true})`. Jika mengedit denah: jalankan ulang test BFS konektivitas (lihat bawah).
- **campaign/stage2.js** — `stage2Scene` (id `campaign-2`) + `CAMP, CAMP_DIR, CAMP_PERP, CAMP_START, highwayWalk, resolve, buildWorld, placeZombies`. Internal `navGrid` (bake di akhir buildWorld: koridor jalan+cincin+serong; median/mobil di-bake lewat resolve — path lewat celah median; lengan barat/timur di luar grid = fallback lurus). `enter()` = pembersihan zombie stage 1 + preset outdoor + teleport + stage msg. `checkWin`: array kosong → `gameOver(true)`.

## config/gameplay.json — kunci tuning

| Seksi | Kunci |
|---|---|
| `player` | maxHp, speed, radius, eyeHeight, crouchDrop, jumpVelocity, gravity |
| `stamina` | max, sprintDrainPerSec, adsDrainPerSec, meleeCost, regenPerSec, recoverThreshold |
| `movement` | sprintMultiplier, crouchMultiplier, adsMultiplier, backpedalWeight, strafeWeight, walkSpreadPenalty, sprintSpreadPenalty |
| `weapons` | maxMags, bulletSpeed, bulletLife, bulletDamage, spreadBase, spreadBloom, heatPerShot, heatCoolPerSec, adsAccuracy, crouchAccuracy; per senjata (`rifle`/`pistol`): magSize, startMags, fireDelayMs, reloadMs, cameraKick |
| `melee` | range, cooldownSec |
| `grenade` | max, start, fuseSec, throwSpeed, throwUpward, killRadius, pushSpeed |
| `zombie` | headHeight, headshotRadius, bodyBlockRadius, clawDamage, clawCooldownSec, clawRange, stopRange, repathSec (rate-limit findPath), stuckSec (macet → repath paksa), turnRadPerSec (laju putar heading — belokan mulus) |
| `survival` | waveSeconds, spawnIntervalBase/Step/Min, maxZombiesBase/Step/Cap, zombieHpBase, zombieHpPerTwoWaves, zombieSpeedBase/Rand/PerWave/Scale |
| `campaign` | zombieHp, zombieSpeedScale, activateMeters, cullDistance |
| `drops` | magChance, grenadeChance, lifetimeSec, medkitHeal |

Catatan: animasi reload otomatis menyesuaikan `reloadMs` (keyframe diskalakan). Nilai visual murni (FOV, amplitudo animasi, warna) sengaja BUKAN di JSON.

## Menjalankan & menguji

- **Wajib HTTP server** (ES modules + fetch config tidak jalan di `file://`): `python -m http.server 8000` → `http://localhost:8000`. `index.html` menampilkan pesan error yang jelas bila dibuka via file://.
- `package.json` hanya metadata `{"type":"module"}` untuk tooling Node (`node --check src/**/*.js`) — tetap TANPA dependensi/build.
- Test headless (Node + stub THREE/DOM, menjalankan modul asli): harness ada di scratchpad sesi pengembangan (`rt/stubs.mjs`, `driver.mjs`, `test-survival.mjs`, `test-campaign.mjs`, `test-config.mjs`) — 61 assert meliputi gerak/pagar/spawner/tembak/cakar/stamina/granat/melee/pickup/lompat/BFS grid/aktivasi idle/wall-slide/peluru-vs-dinding/transisi stage/menang/restart/tuning config. Bila hilang, pola pembuatannya: stub `THREE` (Vector3/Quaternion/Euler matematika nyata, sisanya no-op), stub DOM/Audio/localStorage, set `__GIBS_TEST__` + `__GIBS_CONFIG__`, import `src/main.js`, panggil `boot()` + `startGame(mode)`, drive `updateGame(dt, step, T)` manual dgn `Date.now()` dipalsukan.
