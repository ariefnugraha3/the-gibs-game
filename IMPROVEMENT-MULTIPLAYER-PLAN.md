# Rencana Multiplayer Co-op LAN (Survival, 4 pemain)

> Rencana fitur multiplayer yang arahnya sudah disepakati pemilik proyek
> (2026-07-10). Ditulis agar AI/kontributor berikutnya bisa mengeksekusinya
> TANPA menggali ulang. Status: **belum ada yang dieksekusi.** Perbarui tabel
> Status + "Log eksekusi" di bawah setiap kali satu fase selesai.
>
> **WAJIB dibaca sebelum menyentuh kode: [MODULES.md](MODULES.md) (katalog modul
> + kontrak scene) dan [CLAUDE.md](CLAUDE.md) (aturan arsitektur).** Backlog
> gameplay single-player di [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md) — aturan
> besinya BERLAKU juga di sini.

## Keputusan yang SUDAH dikunci bersama user (2026-07-10)

1. **Co-op 4 pemain, LAN/Wi-Fi jaringan yang sama.** Bukan internet publik —
   tidak perlu NAT traversal/STUN/TURN/matchmaking.
2. **Satu pemain menjadi HOST (listen server)** seperti game co-op sejenis:
   browser host menjalankan simulasi penuh (zombie AI + pathfinding, wave state
   machine, drops, ledakan, Monas HP); 3 client mengirim input & menerima
   snapshot. TIDAK ada lockstep deterministik (kode penuh `Math.random()` +
   `Date.now()` — mustahil deterministik).
3. **Hanya mode Survival** yang di-multiplayer-kan. Campaign tetap single-player.
4. **Single-player TIDAK BOLEH berubah perilaku sedikit pun** saat fitur MP
   nonaktif (`netRole === 'off'`). Semua jalur SP harus tetap byte-identik
   secara perilaku.

## Kenapa BUKAN "P2P murni di browser"

Browser tidak bisa membuka raw socket dan sebuah tab tidak bisa MENERIMA koneksi
masuk. Dua opsi realistis: (a) WebRTC DataChannel (P2P sungguhan tapi butuh
signaling + ICE — kompleks, rapuh di beberapa jaringan), (b) **WebSocket relay
kecil di mesin host** — dipilih karena: proyek ini SUDAH mewajibkan server
statis Python di mesin yang sama, latensi LAN via TCP < 1 ms, dan jauh lebih
mudah di-debug. Game-nya tetap situs statis buildless; relay adalah companion
proses, bukan dependency game.

**Insight kunci:** karena semua pemain memuat game dari server statis di mesin
host (`http://<ip-host>:8000`), maka `location.hostname` DI BROWSER CLIENT
SUDAH = IP host. URL WebSocket diturunkan otomatis:
`ws://${location.hostname}:${CFG.net.port}` — **tidak perlu form "masukkan IP"
sama sekali.** Pemain host cukup membagikan URL http-nya (yang memang sudah
harus dibagikan).

## Arsitektur ringkas

```
mesin HOST                                   mesin client ×3
┌──────────────────────────────┐             ┌─────────────────┐
│ python server.py             │   HTTP GET  │ browser         │
│  ├─ static HTTP :8000  ◄─────┼─────────────┤  (game files)   │
│  └─ WS relay    :8001  ◄─────┼──── WS ─────┤                 │
│         ▲                    │             └─────────────────┘
│         │ WS (loopback)      │
│ browser HOST                 │
│  └─ simulasi penuh (listen   │
│     server) — survivalScene  │
└──────────────────────────────┘
```

- **Relay bodoh** (`server.py`): tidak tahu aturan game apa pun; hanya memberi
  id koneksi dan meneruskan pesan `client → host` dan `host → satu/semua client`.
- **Host** menjalankan `survivalScene` yang ada + lapisan broadcast
  (`src/net/host.js`): snapshot 15 Hz + event reliable (spawn/mati/ledak/dst).
- **Client** menjalankan scene BARU `survivalCoopClientScene` yang
  mengimplementasikan kontrak scene yang sama (MODULES.md) — inilah cara MP
  masuk TANPA melanggar aturan "sistem bersama nol if-else mode": hook
  `zombieAI` client = interpolasi snapshot (bukan pathfinding), `updateMode` =
  proses antrean pesan jaringan (bukan wave spawner). Dunia dibangun dari
  modul world.js yang sama.
- **Gerak diri sendiri client-authoritative** (client kirim posisi, host
  percaya) — co-op antar teman, tanpa prediksi/rollback. **HP pemain
  host-authoritative** (cakar/ledakan dihitung host). **Inventori (amunisi/
  magazen/granat/medkit) lokal per pemain** — hanya menyangkut diri sendiri.
- **Protokol JSON via satu koneksi WS.** Di LAN, 15 Hz × ~30 zombie × ~40 byte
  ≈ 20 KB/s — sangat aman. JANGAN optimasi binary sebelum terbukti perlu.

## Keputusan desain default (ubah hanya lewat user)

| Topik | Keputusan v1 | Alasan |
|---|---|---|
| Skor/currency shop | **Per pemain** (kill dikreditkan ke pembunuh; skor sendiri utk belanja) | Standar genre (COD Zombies, Killing Floor); tanpa drama rebutan pot |
| Pemain mati di tengah wave | **Spectate** (kamera ikut rekan) → **respawn awal wave berikutnya** (HP penuh, inventori tetap) | Sederhana & standar genre; down-and-revive = fase lanjutan |
| Kalah | Monas jatuh ATAU semua pemain mati dalam wave yang sama | |
| Late join setelah start | **Ditolak** (lobby terkunci) | Sinkronisasi world/wave jauh lebih sederhana |
| Host keluar/putus | Sesi berakhir utk semua ("HOST LEFT THE GAME" → menu) — tanpa host migration | v1 |
| Pause | **Tidak ada pause di MP.** ESC = menu lokal (Leave Game) tanpa menghentikan dunia | Dunia bersama tidak bisa berhenti |
| Cheat console | **Nonaktif saat MP** (backtick diabaikan bila `netRole !== 'off'`) | god-mode di co-op = desync & tidak adil |
| Radar | Per pemain (masing-masing beli sendiri) | Konsisten skor per pemain |
| Item Monas (Heal/Strengthen) | Efek GLOBAL, dibayar dari skor pembeli | Objektif bersama |
| Difficulty | Milik host, di-broadcast via CFG saat start | Satu sumber kebenaran |

## Protokol pesan (envelope relay: `{t, from?, ...payload}`)

Relay menambahkan `from` (id koneksi). `to` opsional dari host (`id` | `'all'`).

**Lobby:** `hello {name}` (C→H) · `lobby {players:[{id,name}]}` (H→all) ·
`start {cfg, seed, roster}` (H→all — `cfg` = CFG host SETELAH `applyDifficulty`;
client memakai apa adanya, JANGAN jalankan applyDifficulty lokal).

**Client → Host (gameplay):**
- `p {x,y,z,yaw,pitch,anim,wpn}` — posisi+animasi diri, 20 Hz (`anim` = bitmask
  sprint/crouch/reload/aim/fire/medkit).
- `hit {zid, dmg, head}` — klaim kena peluru (lihat Fase 4).
- `nade {x,y,z,vx,vy,vz}` — titik & kecepatan rilis granat.
- `melee {zid}` · `heal` (selesai channel medkit) · `buy {itemId}` ·
  `ready` (toggle siap next wave) · `take {dropId}`.

**Host → Client:**
- `snap {tick, players:[{id,x,y,z,yaw,pitch,anim,wpn,hp,score,alive}], zombies:
  [{id,x,z,head,kind,scl,state}], nades:[{id,x,y,z}], monas:{hp,max}, wave:
  {num,phase,left,timer,ready}}` — 15 Hz. Zombie TANPA data rig — animasi
  dihitung lokal dari kecepatan interpolasi (`animateZombieRig` yang ada).
- Event reliable (dikirim saat terjadi): `zspawn {id,kind,scl,x,z,jump?}` ·
  `zdie {id, head, byId}` · `boom {x,y,z,r}` · `drop {id,type,x,z}` ·
  `dropgone {id}` · `dmg {id, amount, angle}` (angle utk `showHitDir`) ·
  `buyok {itemId,score}` / `buyno {itemId,reason}` · `wavemsg {kind}` (cleared/
  event fog/blackout) · `wavestart {num}` · `pdown {id}` / `prespawn {id}` ·
  `over {won, title}` · `restart {seed}`.

## Fase pengerjaan

| # | Fase | Perkiraan usaha | Status |
|---|------|-----------------|--------|
| 0 | `server.py` — static + WS relay (stdlib only) | Kecil-sedang | TODO |
| 1 | Net core + lobby (host/join, roster, start tersinkron) | Sedang | TODO |
| 2 | World ber-seed + avatar remote + sync posisi/animasi | Sedang | TODO |
| 3 | Zombie host-authoritative + scene client (id entitas, snapshot, interp, cakar multi-target) | **Besar** | TODO |
| 4 | Combat sync (hit-claim, granat, ledakan/darah/SFX, drops, skor per pemain) | Sedang-besar | TODO |
| 5 | Alur wave & shop MP (tanpa pause, ready-check, beli tervalidasi host) | Sedang | TODO |
| 6 | Mati/spectate/respawn, game over, disconnect, restart | Sedang | TODO |

Kerjakan BERURUTAN — tiap fase bisa diuji sendiri (kriteria "Selesai bila" di
tiap fase). Jangan mulai fase N+1 sebelum fase N lulus uji 2-browser.

---

## Fase 0 — `server.py`: static HTTP + WebSocket relay (stdlib only)

**File baru:** `server.py` di root repo. Satu perintah menggantikan
`python -m http.server 8000`:

```
python server.py     # HTTP statis :8000 + WS relay :8001
```

(`python -m http.server` TETAP jalan untuk single-player — dokumentasikan
keduanya di README/CLAUDE.md.)

**Desain:**
- **Stdlib murni, tanpa pip** — sejalan semangat "tanpa dependency": HTTP via
  `http.server.ThreadingHTTPServer`; WS via `socketserver` + handshake RFC 6455
  manual (`Sec-WebSocket-Accept` = base64(SHA1(key + GUID)), parsing frame
  masked client→server, kirim frame unmasked, text frame saja, tanpa extension,
  balas ping/pong + close frame). ±200 baris, komentar bahasa Indonesia.
- **Model room:** koneksi WS pertama = **host** (relay kirim `{t:'role',
  role:'host', id:0}`); berikutnya = client (`role:'client', id:N`), maks
  `maxPlayers` (tolak sisanya dengan `{t:'full'}`). Routing: pesan dari client
  → diteruskan ke host (ditambah `from`); pesan dari host dgn `to` → satu
  client itu; tanpa `to` → broadcast semua client. Disconnect → beri tahu host
  (`{t:'leave', id}`); host putus → tutup semua koneksi (`{t:'hostleft'}`) dan
  reset room (sesi baru bisa dimulai tanpa restart proses).
- Relay TIDAK memvalidasi/parse payload game — hanya `to`/`from`. Kirim string
  apa adanya (JSON pass-through) supaya murah.

**Selesai bila:** dua tab browser + `wscat`/skrip uji Python bisa: connect →
terima role → client kirim, host terima dgn `from` benar → host broadcast →
semua client terima → client putus → host dapat `leave`.

## Fase 1 — Net core + lobby

**File baru:**
- `src/net/socket.js` — `connectWS()` (URL otomatis
  `ws://${location.hostname}:${CFG.net.port}`), `sendMsg(obj)`
  (JSON.stringify), `onMsg(type, fn)` (dispatch), antrean pesan per frame
  (JANGAN proses di event `onmessage` — kumpulkan, konsumsi di `updateMode`
  scene supaya urutan relatif frame deterministik), status koneksi.
- `src/net/index.js` — live binding pemilik: `netRole` (`'off'|'host'|'client'`)
  + `setNetRole`, `localId`, `roster` (array `{id, name, alive, score}`).
  Default `'off'` — SEMUA jalur SP membaca `'off'` dan tidak berubah.

**Lobby (menu):** kartu mode baru **"CO-OP LAN (SURVIVAL)"** di `#modeSelect`
(`scenes/menu.js` + `index.html`). Klik → panel lobby: input nama (localStorage
`gibsPlayerName`), tombol **HOST GAME** / **JOIN GAME** (join otomatis ke
`location.hostname` — tanpa form IP), daftar pemain live dari pesan `lobby`,
baris difficulty hanya aktif utk host, tombol **START** (host, min 2 pemain).
Start: host kirim `start {cfg: CFG, seed, roster}` → semua memanggil
`startGame('survival')` dgn `netRole` masing-masing. Client menimpa `CFG`
dengan `cfg` kiriman host SEBELUM startGame (satu assign objek penuh — CFG
sudah selesai dipakai `applyDifficulty` di host). **Semua teks lobby English**
(aturan besi #1).

**Selesai bila:** 2 browser (1 mesin cukup: tab biasa + incognito) melihat
roster yang sama, START host membawa keduanya masuk dunia survival, dan mode
SP lain tetap berjalan normal.

## Fase 2 — World ber-seed + avatar remote + sync posisi

**Masalah nyata (sudah diverifikasi):** `buildSurvivalWorld()` memakai **55
panggilan acak**, dan `treeColliders` (collider gameplay: tabrakan player,
nav-grid zombie, clamp drop) ditempatkan acak → tanpa seed bersama, tiap pemain
punya DUNIA TABRAKAN BERBEDA. Wajib dibereskan lebih dulu.

- `utils/math.js`: tambah `mulberry32(seed)` (PRNG kecil deterministik).
- `survival/world.js`: `setWorldSeed(seed)` (export) mengganti sumber acak
  INTERNAL modul (mis. `let R = Math.random` → fungsi seeded; semua `rand`/
  `Math.random` di jalur build dunia memakai `R`). Panggil SEBELUM
  `ensureParkWorld()`. **SP & campaign stage 3 tanpa seed → `R` default
  `Math.random`, perilaku lama utuh.** Animasi decor (api, air) BOLEH tetap
  `Math.random` — visual murni, tak perlu sinkron.
- Host membuat `seed` (sekali, saat START) dan mengirimnya di `start`.

**Avatar remote — file baru `src/entities/remotePlayers.js`:**
- Mesh manusia balok meniru pola `buildHumanZombie` (rig pivot sendiri, JANGAN
  pakai ZG zombie — profil beda: tentara/warga bersenjata, tint non-zombie)
  + **nametag** sprite canvas di atas kepala + balok senjata kecil di tangan
  mengikuti `wpn`. Maks 3 instance — buat saat start MP, JANGAN buat/hapus
  geometry saat gameplay.
- `updateRemotePlayers(dt)`: interpolasi posisi/yaw/pitch dari buffer snapshot
  (delay interp `CFG.net.interpDelayMs` ~120 ms), walk cycle dari kecepatan
  hasil interpolasi, pose dari bitmask `anim` (crouch = pivot badan turun,
  aim/fire = lengan lurus + muzzle flash sprite KECIL **tanpa PointLight** —
  aturan besi lampu).
- Terdaftar di `updateGame` SETELAH blok player (posisi kontrak baru —
  catat di MODULES.md), dan di-reset oleh `resetGame`.

**Sync:** client & host sama-sama kirim `p` 20 Hz (host menyertakan dirinya di
`snap`). Badan pemain lain PEJAL ringan ke player lokal? **Tidak** (v1) —
hindari saling dorong; cukup visual.

**Selesai bila:** 2 pemain saling melihat bergerak mulus (jalan/sprint/jongkok/
aim), pohon & properti di posisi SAMA di kedua layar (bandingkan screenshot),
SP tak berubah.

## Fase 3 — Zombie host-authoritative + scene client (fase terbesar)

**Host (`src/net/host.js`):**
- Stempel `z.id` (counter modul, reset di `resetGame`) di SEMUA jalur spawn
  survival. Snapshot dibangun dari array `zombies` yang hidup: objek polos
  (id, x, z, `navHead` utk arah, kind, scl, state jumping/chasing) — JANGAN
  pernah menyentuh mesh/THREE saat serialisasi.
- Kirim `snap` tiap `1/CFG.net.snapshotHz` (akumulator dt di updateMode host —
  BUKAN `setInterval`, supaya ikut irama game). Event `zspawn`/`zdie`/`boom`/
  `drop`/`dropgone`/`dmg` dikirim saat kejadian (reliable — WS TCP menjamin
  urutan).

**Multi-target cakar (perubahan di scene survival, BUKAN di zombies.js):**
- File baru `src/net/players.js`: `getTargets()` → array `{id, x, y, z, alive}`.
  `netRole 'off'` → `[posisi kamera]` (satu elemen — jalur SP identik).
  MP host → kamera sendiri + roster remote.
- `survivalScene.zombieAI`: ganti semua pemakaian `camera.position` (aggro,
  kejar, cakar) dengan TARGET TERDEKAT yang hidup dari `getTargets()`. Radius
  aggro/monas-lock per target sama seperti sekarang. Hasil cakar → `damageTarget
  (t, dmg, angle)` di net/players.js: target lokal → jalur lama (hp player,
  `flashDamage`, `showHitDir`); target remote → kirim event `dmg {id, amount,
  angle}` + catat hp di roster (authoritative di host).
- **PITFALL:** `navAim` mengembalikan objek BERSAMA — jangan simpan referensi
  target antar frame; evaluasi per frame (pola per-frame `atkMonas` yang ada
  sudah benar, tinggal ganti sumber posisi).

**Client — file baru `src/scenes/survival/coopClient.js` (`survivalCoopClientScene`):**
- Implementasi PENUH kontrak scene (MODULES.md): `playerCollide`/`groundHeight`/
  `bulletBlocked`/`grenadeCollide`/`clampDropPos` = re-ekspor pola survivalScene
  (dunia sama dari world.js); `radarLandmarks` sama; `hudStatus` dari state
  wave kiriman snapshot; `updateMode(dt)` = konsumsi antrean pesan + kirim `p`
  + jalankan interpolasi; `restartScene` = diri sendiri (menunggu `restart`
  host).
- **Zombie ghost:** event `zspawn` → `buildHumanZombie` + `applyVariantTint`
  + push ke array `zombies` GLOBAL yang sama (agar radar, blood, hit-test
  peluru, dan `updateZombies` bekerja tanpa diubah) dgn field minimal
  (`id, kind, scl, hp: Infinity`, `netGhost: true`). Registry `Map id→z` milik
  scene client.
- `zombieAI(z)` client: interpolasi x/z + `navHead` dari buffer snapshot, hitung
  kecepatan interp utk walk cycle rig, `return {}` — **tanpa `chaseDist` = blok
  cakar di zombies.js tidak pernah jalan di client** (pola yang sama dgn
  penggerogot Monas). Zombie yang hilang dari 2 snapshot berturut tanpa event
  `zdie` (edge: pesan tercecer saat reconnect) → hapus diam-diam via
  `disposeZombie`.
- `zdie {id, head, byId}` → mainkan puff + skor bila `byId === localId` (HUD),
  `disposeZombie` + splice. **JANGAN** jalankan logika `killZombie` host
  (skor/stats/pendingBooms) di client — ledakan exploder datang sebagai event
  `boom` terpisah.
- Monas HP client = tampilan dari snapshot; `damageMonas` tidak ada di client.

**Wave machine:** hanya host yang menjalankan `wave.*`/`startWave`/spawner
(sudah di `survivalScene.updateMode`). Client menampilkan `wave` snapshot.
Event fog/blackout: host kirim `wavemsg` → client memanggil fungsi efek yang
sama (animasi fog/light lokal — visual, cukup sinkron via event mulai/selesai).

**Selesai bila:** host + 1 client: zombie melompat pagar & mengejar target
TERDEKAT (uji: client mendekat → zombie beralih), client melihat gerak mulus
tanpa teleport, cakar melukai client (HP turun via `dmg`, wedge arah benar),
Monas digerogoti & HP sinkron, SP tak berubah.

## Fase 4 — Combat sync

**Hit peluru — hook scene baru `onBulletHit(z, b, isHead)` (opsional):**
- `zombies.js` sweep: bila `activeScene.onBulletHit` ada → panggil DAN JANGAN
  kurangi `z.hp` lokal (feedback darah/SFX tetap). Tanpa hook (SP/host) →
  jalur lama byte-identik. Catat hook baru di tabel kontrak MODULES.md.
- Client scene men-supply hook: kirim `hit {zid, dmg, head}` (dmg sudah dikali
  `b.damage × player.dmgMul × headshotMul` — hitungan yang sama dgn zombies.js).
  Host menerima klaim → validasi ringan (zombie ada & hidup) → terapkan damage
  via jalur normal; kill → `killZombie` + `zdie {byId}` (skor ke penembak).
  Klaim atas zombie yang sudah mati diabaikan diam-diam (race normal).
- **Kenapa klaim-client, bukan raycast host:** tanpa rewind/lag-comp, menembak
  target interpolasi dari host = terasa meleset; klaim membuat tembakan terasa
  instan. Risiko cheat tidak relevan di co-op LAN antar teman.

**Skor per pemain:** host menyimpan `roster[i].score`; `addScore` host hanya
utk kill sendiri. `zdie.byId`/`buyok.score` memperbarui skor client. HUD:
`#statsHud` menampilkan skor SENDIRI; skor rekan cukup di shop & roster (jangan
tambah elemen HUD per-frame baru).

**Granat:** client kirim `nade` di titik rilis (posisi+velocity dari
`spawnGrenade` yang di-bypass fisiknya) → host spawn granat ber-`id` + simulasi
penuh → posisi ikut `snap.nades`, ledakan → event `boom` + damage zombie/pemain
di host. Client render granat ghost dari snapshot (mesh `buildGrenadeMesh`
bersama — JANGAN dispose bahan). `explodeAt` dipecah: `explodeVisualAt(pos, r)`
(flash pool + puff + SFX — dipakai client saat `boom`) dan jalur damage tetap
di host. **Antrean `pendingBooms` exploder tetap pola lama di host** (aturan
reentrancy IMPROVEMENT-PLAN #1); client tak pernah menjalankannya.

**Drops:** hanya host men-spawn (`drop {id,type,x,z}`). Pickup: client deteksi
proximity SENDIRI (rasa instan) → `take {dropId}` → host validasi (drop masih
ada) → `dropgone` broadcast + efek item diterapkan LOKAL oleh pengambil
(inventori per pemain). Race dua pemain serentak: host first-come, yang kalah
tidak dapat apa-apa (drop sudah hilang — feed "already full"-style TIDAK perlu;
cukup senyap).

**SFX/efek jarak jauh:** tembakan pemain lain = bitmask `anim.fire` → muzzle
flash + `playSFX` senjata ybs dgn volume jarak; `zdie` → puff + SFX di posisi;
darah HANYA dari tembakan sendiri (pool 14 sprite jangan diperebutkan event
remote).

**Selesai bila:** 2 pemain menembak zombie yang sama → HP habis sesuai total
damage, skor masuk ke penembak yang benar; granat client meledak & melukai
zombie di kedua layar; drop hanya bisa diambil satu pemain; medkit/heal jalan
(`heal` → host set hp).

## Fase 5 — Alur wave & shop multiplayer (tanpa pause)

**Prinsip: dunia TIDAK PERNAH berhenti di MP.** Perubahan minimum yang tidak
menyentuh perilaku SP:

- Hook scene opsional baru **`shopPauses()` → bool** (catat di MODULES.md):
  `input.js` & alur shop memanggil `activeScene.shopPauses?.() ?? true`.
  survivalScene (SP) tanpa hook → `true` = perilaku lama persis. Scene MP
  (host & client) → `false`: saat shop terbuka pointer dilepas TANPA
  `setPaused(true)` — dunia & interpolasi jalan terus di belakang modal (fase
  'shopping' memang tanpa zombie).
- **Ready-check menggantikan pause:** fase `'shopping'` host punya batas
  `CFG.net.shopMaxSec` (60 s) di `hudStatus` + status siap per pemain. Tombol
  **Start Next Wave** & konfirmasi "Are you ready?" yang ada di-remap MP jadi
  toggle **READY** (`ready` → host). Semua pemain hidup ready ATAU timer habis
  → host `wavestart {num}` → semua menutup shop + `requestLock()`. HUD shop:
  "Waiting for players... (2/4 ready)" (English).
- **Pembelian tervalidasi host:** client `buy {itemId}` → host cek
  `roster.score` + state global (Monas penuh? radar sudah dimiliki pembeli?
  — kepemilikan radar/senjata per pemain dilacak host seperlunya utk validasi)
  → `buyok {itemId, newScore}` → CLIENT menjalankan `apply()` item pada state
  lokalnya (amunisi/medkit/senjata/radar) — `shopPurchase` dipecah: validasi+
  potong skor (host) vs efek item (pembeli). `buyno {reason}` → tampilkan
  alasan di panel deskripsi. Item Monas: efek global dieksekusi host
  (`healMonas`/`strengthenMonas`), hasil terlihat semua via snapshot.
- Host sendiri belanja lewat jalur yang sama secara lokal (validasi fungsi
  langsung, tanpa WS) — SATU implementasi validasi, dua pemanggil.

**Selesai bila:** wave bersih → shop terbuka di semua pemain tanpa mem-pause
siapa pun; dua pemain belanja bersamaan dgn skor masing-masing; yang tidak
ready menahan wave sampai timer; SPACE host tidak bisa memaksa start sebelum
ready/timer; SP shop tetap mem-pause seperti sekarang.

## Fase 6 — Mati/spectate/respawn, game over, disconnect, restart

- **Pemain tumbang (hp 0 di host):** BUKAN `gameOver`. Host `pdown {id}` →
  di pemain itu: input gameplay dimatikan, kamera spectate (ikuti rekan hidup
  terdekat; klik = ganti rekan), overlay "YOU ARE DOWN — respawning next wave"
  (English). Zombie berhenti menarget pemain mati (`getTargets` filter
  `alive`). Awal wave berikutnya: host `prespawn {id}` → respawn di gerbang
  selatan, HP penuh, inventori tetap.
- **Game over (host yang memutuskan):** Monas jatuh ATAU semua pemain mati
  dalam wave yang sama → `over {won:false, title}` → semua menampilkan layar
  game over lokal (`gameOver` yang ada, stats lokal masing-masing).
- **Restart:** tombol restart game-over hanya berfungsi di host → `restart
  {seed}` (seed BARU) → semua `resetGame()` + set seed; client menunggu dgn
  teks "Waiting for host..." pada layar game over.
- **Disconnect:** client putus → host hapus dari roster + avatar (`leave` dari
  relay), sisanya lanjut main. Host putus → relay `hostleft` → client tampilkan
  "HOST LEFT THE GAME" → `location.reload()` (pola EXIT GAME pause menu).
- **ESC di MP:** pause menu yang ada dialihfungsikan — tanpa `setPaused`;
  RESTART hanya utk host (sembunyikan di client), EXIT = reload (meninggalkan
  sesi). Dunia jalan terus di belakang blocker.

**Selesai bila:** skenario 3-browser: satu mati → spectate → respawn wave
berikut; semua mati → game over serentak; host restart → run baru dgn dunia
baru yang identik di semua layar; cabut kabel/tutup tab client → sisa pemain
aman; tutup tab host → client keluar rapi.

---

## Config baru — seksi `net` di `config/gameplay.json`

```json
"net": {
  "port": 8001,
  "maxPlayers": 4,
  "snapshotHz": 15,
  "inputHz": 20,
  "interpDelayMs": 120,
  "shopMaxSec": 60
}
```

**WAJIB:** daftarkan `"net"` di array `SECTIONS` `src/core/config.js` — kalau
tidak, boot gagal (aturan besi IMPROVEMENT-PLAN #4).

## Pitfall lintas fase (baca sebelum koding)

1. **Identitas entitas = `id`, BUKAN indeks array.** Array `zombies` di-splice
   mundur — indeks tidak stabil. Semua pesan jaringan memakai id.
2. **Jangan serialisasi objek THREE** (mesh/vector punya referensi melingkar) —
   snapshot dibangun sebagai objek polos field-per-field.
3. **Jangan proses pesan di `onmessage`** — antre, konsumsi di `updateMode`
   (urutan terhadap frame deterministik, dan `releaseInputs`/pause tidak
   menyela di tengah frame).
4. **Lampu:** muzzle flash remote & ledakan client HANYA memakai pool 3 lampu
   yang ada / sprite tanpa lampu. Dilarang PointLight baru saat gameplay.
5. **CFG client = kiriman host apa adanya.** Jangan `applyDifficulty` lokal di
   client (difficulty localStorage client bisa beda → desync HP zombie).
6. **`setWorldSeed` SEBELUM `ensureParkWorld`,** dan hanya di jalur MP — SP &
   campaign stage 3 (yang memakai ulang dunia taman) tetap `Math.random`.
7. **`Date.now()` aman utk lokal** (fire-rate/reload diri sendiri), TAPI semua
   timer bersama (wave, shop countdown, fuse granat) milik host dan dikirim
   sebagai sisa detik di snapshot — jangan hitung ulang dari wall-clock client.
8. **Semua teks baru English** (lobby, ready, down, host left, dsb) — aturan
   permanen. Komentar kode Indonesia.
9. **`netRole==='off'` harus mengembalikan SEMUA jalur ke perilaku lama** —
   uji regresi SP (survival & campaign) tiap fase, termasuk shop pause SP.
10. **Keyboard Lock & pointer:** lobby & shop MP berjalan tanpa pointer lock —
    pastikan `hasStarted`/pause-menu input.js tidak salah menampilkan blocker
    (pakai predikat `shopActive`/`shopPauses` yang sudah ada, jangan tambah
    if-else mode di input.js).
11. **`updateGame` adalah kontrak:** blok baru (remote players, net flush)
    disisipkan di posisi yang ditetapkan + didokumentasikan di MODULES.md —
    jangan menyisipkan panggilan net di tengah blok lain.

## Verifikasi

- **Headless (pola MODULES.md paling bawah):** fungsi murni dapat diuji tanpa
  browser — codec pesan (round-trip), `buildSnapshot` dari array zombie stub,
  `applySnapshot`/interpolasi (posisi di antara dua snapshot), validasi
  pembelian host (skor kurang/Monas penuh/radar dobel), relay `server.py`
  (skrip Python: 3 socket palsu, cek routing host↔client).
- **Manual 2-browser (1 mesin):** `python server.py` → tab normal (host) + tab
  incognito (client) → checklist per fase di atas. Uji 4 pemain nyata via
  Wi-Fi minimal sekali sebelum menandai Fase 6 selesai.
- **Regresi SP tiap fase:** survival & campaign SP dimainkan singkat —
  perilaku, shop pause, pause menu, cheat console harus persis seperti sebelum
  fase dikerjakan.
- Selesai fase apa pun: **update MODULES.md** (modul/hook/kunci config baru)
  dan tabel Status di atas. JANGAN commit — user commit sendiri.

## Log eksekusi

(kosong — isi per fase yang selesai: tanggal, ringkasan, penyimpangan dari
rencana + alasannya)
