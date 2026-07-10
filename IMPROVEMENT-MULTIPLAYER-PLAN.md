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
5. **Host membuat NAMA ROOM saat hosting; client wajib memasukkan nama room
   yang sama untuk join** (keputusan user 2026-07-10). Konsekuensi enak: satu
   relay bisa menampung BEBERAPA room sekaligus (masing-masing 1 host + maks
   3 client), dan salah ketik nama = ditolak rapi, bukan nyasar ke sesi orang.

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

- **Relay bodoh** (`server.py`): tidak tahu aturan game apa pun. Ia HANYA
  mem-parse pesan kontrol lobby (`create`/`join`/`lock`) untuk mengelola
  registry room bernama; semua pesan lain diteruskan apa adanya di DALAM room:
  `client → host` dan `host → satu/semua client` room itu.
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

**Kontrol lobby (SATU-SATUNYA pesan yang di-parse relay):**
`create {room, name}` (H→relay — buat room + jadi host) · `join {room, name}`
(C→relay — masuk room bernama itu) · balasan relay: `role {role, id, room}`
(sukses) / `taken` (nama room sudah dipakai) / `noroom` (room tidak ditemukan)
/ `full` (room penuh) / `locked` (game sudah mulai) · `joined {id, name}`
(relay→H saat client sukses masuk) · `lock` (H→relay saat START — room menolak
join baru) · `leave {id}` (relay→H) / `hostleft` (relay→semua anggota room).

**Lobby level game (pass-through biasa):** `lobby {players:[{id,name}]}`
(H→all) · `start {cfg, seed, roster}` (H→all — `cfg` = CFG host SETELAH
`applyDifficulty`; client memakai apa adanya, JANGAN jalankan applyDifficulty
lokal).

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
| 0 | `server.py` — static + WS relay (stdlib only) | Kecil-sedang | **SELESAI 2026-07-10** |
| 1 | Net core + lobby (host/join, roster, start tersinkron) | Sedang | **SELESAI 2026-07-10** |
| 2 | World ber-seed + avatar remote + sync posisi/animasi | Sedang | **SELESAI 2026-07-10** |
| 3 | Zombie host-authoritative + scene client (id entitas, snapshot, interp, cakar multi-target) | **Besar** | **SELESAI 2026-07-10** |
| 4 | Combat sync (hit-claim, granat, ledakan/darah/SFX, drops, skor per pemain) | Sedang-besar | **SELESAI 2026-07-10** |
| 5 | Alur wave & shop MP (tanpa pause, ready-check, beli tervalidasi host) | Sedang | **SELESAI 2026-07-10** |
| 6 | Mati/spectate/respawn, game over, disconnect, restart | Sedang | **SELESAI 2026-07-10** |

Semua fase diverifikasi headless (70 assert — lihat Log eksekusi). **Yang belum:
uji manual 2-browser + 4 pemain nyata via Wi-Fi** (checklist per fase di atas) —
lakukan sebelum menganggap fitur ini rilis; penyimpangan desain yang disengaja
terdokumentasi di Log eksekusi.

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
- **Model room BERNAMA** (keputusan user 2026-07-10): koneksi baru belum jadi
  apa-apa sampai pesan pertamanya —
  `create {room, name}` → pengirim jadi **host** room itu (balasan
  `role {role:'host', id:0, room}`; nama sudah dipakai → `taken`);
  `join {room, name}` → masuk sebagai client (`role {role:'client', id:N,
  room}` + relay memberi tahu host `joined {id, name}`; room tidak ada →
  `noroom`; penuh [`maxPlayers`] → `full`; sudah dikunci → `locked`).
  Nama room dinormalisasi (trim + lowercase) sebelum dibandingkan. Registry
  `dict nama → room` — satu proses relay menampung BEBERAPA room sekaligus.
- **Routing HANYA di dalam room:** pesan client → host room-nya (ditambah
  `from`); pesan host dgn `to` → client itu; tanpa `to` → broadcast semua
  client room. Pesan lintas room mustahil secara konstruksi.
- **Lifecycle:** host kirim `lock` saat START → relay menolak join baru ke
  room itu (`locked`). Client putus → host dapat `{t:'leave', id}`. Host putus
  → semua anggota dapat `{t:'hostleft'}`, koneksi ditutup, room DIHAPUS dari
  registry (nama bisa langsung dipakai lagi tanpa restart proses).
- Relay TIDAK memvalidasi/parse payload game — HANYA pesan kontrol lobby
  (`create`/`join`/`lock`). Sisanya dikirim string apa adanya (JSON
  pass-through) supaya murah.

**Selesai bila:** skrip uji Python/`wscat` membuktikan: create → role host;
join nama benar → role client + host dapat `joined`; join nama salah →
`noroom`; create nama kembar → `taken`; pemain ke-5 → `full`; join setelah
`lock` → `locked`; routing pesan dua room PARALEL tidak saling bocor; client
putus → host dapat `leave`; host putus → anggota dapat `hostleft` + nama room
bisa dipakai ulang.

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
(`scenes/menu.js` + `index.html`). Klik → panel lobby dua langkah:

1. **Form:** input **Your Name** (localStorage `gibsPlayerName`) + input
   **Room Name** (localStorage `gibsRoomName`) + dua tombol:
   **CREATE ROOM** (kirim `create` → jadi host) dan **JOIN ROOM** (kirim
   `join` → jadi client). Koneksi otomatis ke `location.hostname` — tetap
   tanpa form IP. Nama room wajib diisi (tombol disabled bila kosong).
   Balasan error relay ditampilkan di panel (English): `noroom` → "Room not
   found — check the room name", `taken` → "Room name already taken",
   `full` → "Room is full", `locked` → "Game already started".
2. **Ruang tunggu:** judul = nama room, daftar pemain live dari pesan `lobby`
   (host menyiarkannya ulang tiap `joined`/`leave`), baris difficulty hanya
   aktif utk host, tombol **START** (hanya host, min 2 pemain), tombol
   **LEAVE** (tutup WS → kembali ke form).

Start: host kirim `lock` (relay mengunci room) lalu `start {cfg: CFG, seed,
roster}` → semua memanggil `startGame('survival')` dgn `netRole` masing-masing.
Client menimpa `CFG` dengan `cfg` kiriman host SEBELUM startGame (satu assign
objek penuh — CFG sudah selesai dipakai `applyDifficulty` di host). **Semua
teks lobby English** (aturan besi #1).

**Selesai bila:** 2 browser (1 mesin cukup: tab biasa + incognito): host
membuat room bernama, client dgn nama room SALAH ditolak dgn pesan "Room not
found", nama BENAR masuk & kedua roster sama, START host membawa keduanya
masuk dunia survival, join ketiga setelah START ditolak "Game already
started", dan mode SP lain tetap berjalan normal.

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

## Distribusi & transport lain (GitHub Pages / itch.io / Steam — BARU 2026-07-10)

Desain ini SENGAJA mengisolasi transport di `src/net/socket.js` (antarmuka:
`connectWS`/`sendMsg`/`setMsgHandler`/`setCloseHandler`). Semua logika co-op
(snapshot, klaim, room, ready-check, protokol pesan) TIDAK tahu pesannya lewat
apa — jadi menerbitkan co-op di kanal lain = **mengganti pipa di balik antarmuka
itu**, `host.js`/`coopClient.js`/`players.js` tidak disentuh.

**Batasan yang perlu dipahami:** halaman HTTPS (GitHub Pages, itch web) TIDAK
bisa membuka `ws://` ke IP LAN (mixed content diblokir browser) dan hosting statis
tidak bisa menjalankan relay — maka co-op TIDAK berfungsi dari URL GitHub Pages/
itch web dgn pipa sekarang (kartu Co-op menampilkan error relay; single-player
tetap utuh). Jalur LAN yang benar tetap: host `python server.py`, teman buka
`http://<ip-host>:8000`.

| Kanal | Pipa | Status |
|---|---|---|
| LAN (browser) | `server.py` di mesin host — `location.hostname` = IP host | **SELESAI** |
| Web publik (Pages/itch HTML5) | relay publik `wss://` (VPS+Caddy / Cloudflare Durable Objects) + `CFG.net.relayUrl` di socket.js | Rencana |
| itch desktop (Electron) | relay di-port ke Node, embedded di proses utama; join-by-IP / discovery UDP-mDNS (trik hostname mati di Electron) | Rencana |
| Steam | `socket-steam.js`: Steamworks lobby + P2P (Steam Datagram Relay) via `steamworks.js` — invite lewat overlay, tanpa server sendiri | Rencana |

Detail per kanal (hosting relay, perubahan socket.js, pemetaan room→lobby Steam,
field versi game di `create`/`join`, checklist) ada di
**[STEAM-DESKTOP-PLAN.md](STEAM-DESKTOP-PLAN.md) §6.5** — satu sumber kebenaran
utk urusan distribusi; bagian ini hanya ringkasan + batasan arsitektur.

## Verifikasi

- **Headless (pola MODULES.md paling bawah):** fungsi murni dapat diuji tanpa
  browser — codec pesan (round-trip), `buildSnapshot` dari array zombie stub,
  `applySnapshot`/interpolasi (posisi di antara dua snapshot), validasi
  pembelian host (skor kurang/Monas penuh/radar dobel), relay `server.py`
  (skrip Python: create/join/nama salah/`taken`/`full`/`lock`, routing
  host↔client, isolasi DUA room paralel).
- **Manual 2-browser (1 mesin):** `python server.py` → tab normal (host) + tab
  incognito (client) → checklist per fase di atas. Uji 4 pemain nyata via
  Wi-Fi minimal sekali sebelum menandai Fase 6 selesai.
- **Regresi SP tiap fase:** survival & campaign SP dimainkan singkat —
  perilaku, shop pause, pause menu, cheat console harus persis seperti sebelum
  fase dikerjakan.
- Selesai fase apa pun: **update MODULES.md** (modul/hook/kunci config baru)
  dan tabel Status di atas. JANGAN commit — user commit sendiri.

## Log eksekusi

- **2026-07-10 — Fase 0 SELESAI.** `server.py` di root (stdlib murni): HTTP
  statis (ThreadingHTTPServer, no-store) + relay WS RFC 6455 hand-rolled
  (handshake, unmask, fragmentasi, ping/pong/close) dgn room bernama
  (registry `dict`, normalisasi trim+lowercase, `lock`, pembubaran saat host
  putus). Port & maxPlayers dibaca dari `config/gameplay.json` seksi `net`
  (fallback 8000/8001/4); argv menimpa (`python server.py [http] [ws]`) utk
  uji. Diuji 24 assert (skrip klien WS stdlib di scratchpad, pola bisa ditiru
  dari sini): create/join/noroom/taken/full/locked, `from`/`to`/broadcast,
  isolasi 2 room paralel, leave/hostleft/reuse nama. Tanpa penyimpangan.

- **2026-07-10 — Fase 1–6 SELESAI (satu sesi implementasi penuh).**
  **File baru:** `src/net/index.js` (netRole/localId/roster/selfReady + tabel
  kompak WPN/KIND + r1/r2 — TANPA impor modul game), `src/net/socket.js`
  (WS auto-URL dari location.hostname; handler langsung [lobby+client] ATAU
  antrean [host], cap 1200), `src/net/players.js` (seam getTargets/creditKill/
  damageRemotePlayer/damageNearbyRemotes/onPlayerZeroHp/localDown/updateDownCam/
  reviveLocal), `src/net/host.js` (hostUpdate: drain pesan + snapshot 15 Hz;
  seam hostOn*; ready-check + shopTimer), `src/entities/remotePlayers.js`
  (avatar interpolasi + nametag + muzzle-flash sprite),
  `src/scenes/survival/coopClient.js` (scene client kontrak penuh).
  **File diubah:** gameplay.json+config.js (seksi `net`), math.js (mulberry32),
  world.js (`setWorldSeed` — 55 titik acak build via `R()`/`wrand()`),
  zombies.js (killZombie byId→creditKill+hostOnZombieDie; hook onBulletHit;
  onPlayerZeroHp; damageNearbyRemotes), effects.js (explodeVisualAt terpisah;
  explodeAt byId + hostOnExplode), drops.js (id + hostOnDropSpawn/Taken;
  hook onDropTake; spawnNetDrop; applyDropPickup), grenades.js (id+by; hook
  onGrenadeThrow; spawnRemoteGrenade), weapons.js (hook onMeleeHit),
  game.js (seam hostOnGameOver/hostOnRestart/resetDown), input.js (hook
  `pausable`; telan input MP saat unlocked/tumbang; cheat console off; restart
  host-only), pauseMenu.js (RESTART disembunyikan di client), hud.js (blip
  rekan di radar), survival/index.js (z.id+zspawn; zombieAI multi-target via
  getTargets; cakar remote di scene; hostUpdate/hostShoppingUpdate/hostOnWaveStart/
  hostOnEvent; pausable; getWaveInfo), shop.js (READY toggle; item Monas via
  host utk client; shopNetResult; shopMpTick), menu.js (lobby lengkap),
  main.js (client → coopClientScene), index.html (+kartu Co-op, #coopLobby,
  #goRestartHint), style.css (+lobby & .shopReady).
  **PENYIMPANGAN DESAIN yang disengaja** (semuanya menyederhanakan tanpa
  mengorbankan tujuan — perbarui bila di kemudian hari diubah):
  1. **HP pemain = client-authoritative** (bukan host): host mengirim event
     `dmg`; pemain menerapkan ke hp-nya sendiri & melapor `down`. Alasan:
     medkit/heal shop lokal — menghindari dual-tracking hp yang pasti desync.
  2. **Skor client-authoritative utk BELANJA** (host tetap sumber kredit kill
     via `zdie by/pts`): semua item lokal dibeli tanpa round-trip; HANYA item
     Monas (efek global) divalidasi+dieksekusi host (`buy`→`buyok/buyno`).
  3. **Client memakai handler pesan LANGSUNG, bukan antrean** — `restart`/
     `over`/`hostleft` wajib terproses saat updateGame berhenti (game over);
     aman karena event WS browser berjalan antar-frame. Host tetap antrean.
  4. `wavemsg` diganti: fase wave via snapshot `w`; `wavestart` utk mulai
     wave + revive; event fog/blackout via `evt` (client mereplikasi animasi).
  5. Hook `shopPauses()` rencana di-GENERALISASI jadi `pausable()` (MP tidak
     bisa pause SAMA SEKALI, bukan cuma shop).
  6. `restart` TANPA seed baru — dunia dibangun SEKALI per sesi halaman
     (guard ensureParkWorld), jadi run baru memakai dunia yang sama di semua
     pemain (konsisten; sama dgn perilaku restart SP).
  7. Prompt "Are you ready?" di MP dilewati — tombol = TOGGLE READY langsung
     (ready-check sudah dua-langkah secara alami).
  8. Hook klaim tambahan yang tak ada di rencana: `onMeleeHit`,
     `onGrenadeThrow`, `onDropTake` (pola sama dgn onBulletHit).
  9. `dropgone` membawa `ty` (type) supaya klaim yang dikabulkan tidak
     bergantung pada entry drop lokal yang mungkin sudah kedaluwarsa.
  **VERIFIKASI (70 assert headless, semua LULUS):** harness stub THREE/DOM/
  Audio/WebSocket(node:net) di scratchpad sesi (`rt/stubs.mjs`) menjalankan
  MODUL ASLI: `test-sp.mjs` (23 assert — regresi SP: spawner, id zombie,
  gerak ke Monas, tembak-mati via sweep+creditKill, cakar, shop beli/tolak,
  pause modal shop, game over, SPACE restart, run baru), `test-campaign.mjs`
  (5 assert — smoke campaign utuh), `test-coop.mjs` + `driver-coop.mjs`
  (18 assert END-TO-END: relay nyata + 2 proses game — room create/join,
  dunia ber-seed IDENTIK [collider pohon sama persis], ghost zombie id host,
  posisi sinkron ±10 unit, klaim kill → skor ke client SAJA + roster host,
  cakar multi-target → `dmg` → hp client, tumbang [bukan game over] + host
  menandai, wave baru me-revive + HUD sinkron, game over tersiar, restart
  tersinkron, client putus → roster bersih), plus `test_relay.py` (24 assert
  Fase 0). Bila harness hilang: pola pembuatannya = stub THREE (Vector3/
  Quaternion/Euler matematika NYATA, sisanya Proxy generik; post-processing
  SENGAJA absen), stub DOM auto-create getElementById, `enableFakeClock()`
  utk fire-rate, WebSocket klien RFC 6455 di atas node:net, dua proses
  driver dikendalikan stdin/stdout JSON.
  **Dua bug ditemukan & diperbaiki pada review akhir:** (a) pesan yang tiba
  antara `launch()` lobby dan `enter()` scene client mengendap di antrean —
  `setMsgHandler(fn)` kini MEM-FLUSH antrean ke handler baru; (b) `requestLock`
  yang dipicu remote (ready pemain lain / timer shop / restart host) ditolak
  browser tanpa gesture, dan karena unlock terjadi saat shop (blocker sengaja
  tersembunyi) tidak ada permukaan klik utk me-lock ulang — tambah
  `showBlockerIfUnlocked()` (input.js): cek ±350 ms setelah requestLock; masih
  unlocked & bukan shop/game-over → tampilkan blocker klik-untuk-lanjut
  (dipanggil startNextWave MP, wavestart client, restart client).
  **BELUM DILAKUKAN:** uji manual 2-browser (tab + incognito) & 4 pemain
  nyata via Wi-Fi; profil bandwidth nyata. Perilaku yang DISENGAJA: client
  yang masih di blocker "Click to Start" sudah berada di dunia (posisi
  gerbang) dan bisa diserang — sama seperti pemain AFK.

- **2026-07-10 — Kolom "Server Address" di lobby (temuan uji nyata user).**
  Kasus: client membuka halaman BUKAN dari server host (mis. `localhost` di
  mesinnya sendiri / GitHub Pages) → auto-URL `location.hostname` salah sasaran
  (`ws://localhost:8001`). Solusi: (a) input opsional **SERVER ADDRESS** di form
  lobby (persist `gibsServerAddr`; `normalizeWsAddr` menerima `ip`, `ip:port`,
  `ws(s)://…`, `http(s)://…` — kosong = auto lama, 8 kasus diuji unit);
  (b) `connectWS` menerima `urlOverride` (param ke-3, backward-compatible);
  (c) `server.py` +endpoint **`/lanip`** (IP LAN via trik socket UDP) + banner
  startup menampilkan alamat share; (d) ruang tunggu HOST menampilkan hint
  "Friends: open http://<ip>:8000 — or Server Address ws://<ip>:8001"
  (`#lobbyShare`; gagal senyap bila halaman bukan dari server.py); (e) pesan
  error koneksi kini menyebut kolom Server Address. E2E co-op 18 assert diulang
  — tetap lulus.
