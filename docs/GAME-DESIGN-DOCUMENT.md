# DECOMMISSION DAY — Game Design Document

> **Status:** GDD induk untuk rekonstruksi game  
> **Versi dokumen:** 1.0 — snapshot implementasi 2026-08-23  
> **Genre:** browser top-down action shooter / horde shooter  
> **Mode:** Campaign 13 stage + Survival tanpa akhir  
> **Presentasi:** 3D low-poly prosedural, kamera oblique top-down  
> **Teknologi implementasi referensi:** Three.js r128, ES modules, tanpa build step  
> **Bahasa dokumen:** Indonesia  
> **Bahasa seluruh teks yang dilihat pemain:** English

---

## 0. Tujuan dokumen dan aturan pemakaian

Dokumen ini adalah spesifikasi menyeluruh untuk membuat ulang **Decommission Day** dengan identitas, alur, rasa bermain, dan kontrak teknis yang setara dengan game referensi. Dokumen ini sengaja lebih operasional daripada GDD tradisional: setiap sistem dijelaskan dari niat desain sampai state machine, data, edge case, dan acceptance criteria.

AI atau tim yang melakukan rekonstruksi harus dapat menjawab lima pertanyaan dari dokumen ini sebelum menulis fitur:

1. Apa pengalaman yang harus dirasakan pemain?
2. Apa aturan gameplay yang tidak boleh berubah?
3. State apa yang dimiliki sistem, dan bagaimana transisinya?
4. Data apa yang harus tunable, dan siapa pemilik state-nya?
5. Bagaimana membuktikan implementasi tidak softlock, tidak berbohong kepada pemain, dan tidak merusak performa?

### 0.1 Hierarki sumber kebenaran

Jika membuat ulang dari repository ini, gunakan urutan otoritas berikut:

1. Kode yang berjalan dan [`config/gameplay.json`](../config/gameplay.json) untuk perilaku serta angka snapshot terkini.
2. [`CLAUDE.md`](../CLAUDE.md) untuk keputusan dan invariant terbaru.
3. GDD ini untuk bentuk produk menyeluruh dan prosedur rekonstruksi.
4. [`campaign.md`](campaign.md), [`survival.md`](survival.md), [`combat.md`](combat.md), dan [`presentation.md`](presentation.md) untuk histori dan detail subsistem.
5. [`MODULES.md`](MODULES.md) untuk katalog implementasi dan kontrak antarmodul.
6. [`CAMPAIGN-STAGES-9-13-PLAN.md`](CAMPAIGN-STAGES-9-13-PLAN.md) untuk blueprint arc kedua.

Jika membangun ulang tanpa repository, GDD ini menjadi sumber utama. Nilai yang diberi label **snapshot** adalah baseline balancing, bukan angka yang boleh tersebar sebagai hardcode.

### 0.2 Tiga tingkat keputusan

| Tingkat | Makna | Contoh |
| --- | --- | --- |
| **Canon / invariant** | Tidak boleh diubah tanpa keputusan desain eksplisit | top-down, 13 stage, Shift=dodge, tidak ada reload, palet GIBS 2045, urutan Campaign |
| **Kontrak sistem** | Boleh diimplementasikan dengan teknologi lain, tetapi hasil dan edge case harus sama | scene hooks, swept bullets, pathfinding, shop modal, checkpoint per stage |
| **Tuning** | Boleh diubah melalui data setelah playtest | HP, damage, jumlah robot, durasi telegraph, harga shop |

### 0.3 Definisi “rekonstruksi berhasil”

Rekonstruksi dinyatakan berhasil bila:

- kedua mode dapat dimainkan dari menu sampai kondisi akhirnya;
- Campaign memiliki 13 stage dalam urutan dan struktur yang dijelaskan di sini;
- Survival tidak memiliki akhir buatan dan eskalasinya tetap data-driven;
- kontrol, kamera, combat cadence, loot, shop, armor, AI, boss, dan checkpoint mempertahankan kontrak perilaku;
- tidak ada route yang softlock, spawn di dalam blocker, peluru melewati pintu tertutup, atau telegraph yang tidak sesuai hit area;
- art, UI, audio, dan kepadatan visual terasa seperti dunia yang sama;
- seluruh nilai gameplay yang mungkin ditune berada di data, bukan tersebar di kode;
- tes deterministik dapat menjalankan tiap state penting tanpa menunggu permainan real-time penuh.

---

## 1. Ringkasan produk

### 1.1 High concept

**Decommission Day** adalah top-down shooter berlatar Indonesia tahun 2045. Jaringan AI nasional G.A.R.U.D.A dan pasukan robot Iron Battalion telah dibajak. Pemain menjadi **Major Gibran**, prajurit elite terakhir yang harus mengambil kill-switch dari markas N.U.S.A., membawanya melintasi Jawa hingga IKN, menonaktifkan pasukan jaringan, lalu kembali ke Monas untuk menghancurkan otoritas militer air-gapped bernama **M-0 MAHAPATIH**.

Game menggabungkan:

- gerak dan bidik independen ala twin-stick shooter menggunakan WASD + mouse;
- horde robot dengan melee dan ranged pressure;
- arena yang menekankan positioning, sight line, pintu, cover, dan rute;
- loot fisik yang harus dipungut untuk membiayai upgrade;
- stage yang sengaja berganti format: kantor, pabrik, boss tank, kereta, flyover, vehicle chase, bandara, pelabuhan, hutan, transmitter, final boss;
- procedural low-poly 3D tanpa ketergantungan model eksternal.

### 1.2 Unique selling points

1. **Indonesia 2045 yang mudah dikenali tetapi tidak menjadi cyberpunk generik.** Jakarta, Bandung, Pasupati, Cisumdawu, Kertajati, Balikpapan, IKN, dan Monas disampaikan melalui arsitektur dan lingkungan.
2. **Campaign dengan variasi format besar tetapi satu bahasa combat.** Pemain selalu memahami cara bergerak, membidik, menembak, dodge, melee, dan loot meski stage berubah drastis.
3. **Robot horde yang terbaca dari metal tier.** C=bronze melee, B=silver ranged, A=gold ranged; mata semua merah.
4. **Destruksi yang berwujud.** Robot roboh, terbelah, atau tercerai menjadi scrap dan coolant; kendaraan serta mesin menjadi wreck dari bagian rig mereka sendiri.
5. **Kamera top-down sinematik.** Gameplay tetap jelas, sedangkan cutscene memakai shot language, telegraph, hit-stop, camera focus, bars, dan curtain tanpa memisahkan dunia menjadi video.

### 1.3 Platform dan sesi

- Referensi: desktop browser dengan keyboard dan mouse.
- Penyajian layar lebar 16:9 sebagai target utama; layout dan kamera harus aman sampai 21:9.
- Sesi Survival dapat berlangsung selama pemain mampu bertahan.
- Campaign menyimpan checkpoint stage, bukan save state penuh.
- Tidak ada multiplayer, co-op, live service, microtransaction, atau akun online.

---

## 2. Visi pengalaman dan pilar desain

### 2.1 Fantasi pemain

Pemain harus merasa sebagai prajurit manusia yang sangat kompeten namun tetap rapuh, bergerak di antara mesin dalam jumlah besar. Kekuatan pemain datang dari kontrol, positioning, pemilihan senjata, dodge timing, environmental kills, dan persiapan loadout—bukan dari menjadi superhero kebal.

### 2.2 Pilar

#### Pilar A — Gerak-bidik yang langsung dan dapat dipercaya

- W/A/S/D selalu relatif terhadap layar, bukan kompas dunia.
- Mouse menentukan arah badan atas dan tembakan.
- Pemain dapat bergerak ke satu arah sambil membidik arah lain.
- Strafe dan backpedal lebih lambat daripada bergerak ke arah bidik.
- Collision memakai hug-and-slide; menabrak sudut tidak boleh membuat pemain menempel.

#### Pilar B — Ancaman banyak, sinyal sederhana

- Normal enemy hanya tiga kelas.
- Bentuk, ukuran, metal tier, senjata tangan, dan perilaku mengomunikasikan kelas.
- Serangan berat selalu punya telegraph yang setia pada hit area.
- Tidak ada visible robot health/damage state; hit feedback menunjukkan registrasi, bukan sisa HP.

#### Pilar C — Setiap stage punya tesis

Setiap stage harus dapat diringkas dalam satu kalimat mekanis:

- S1: infiltrasi dan pengambilan kill-switch.
- S2: scavenging komponen dan memulihkan lift.
- S3: membobol factory floor dan menghentikan produksi.
- S4: perjalanan urban yang berakhir pada duel tank.
- S5: merebut kereta dan bertahan dalam assault bergerak.
- S6: false homecoming, menembus Bandung dan menemukan keterbatasan kill-switch.
- S7: maze kendaraan sepanjang flyover di bawah mortar.
- S8: vehicle pursuit dan duel gunship berbasis lane reading.
- S9: menyeberangi tiga zona bandara dan menerbangkan transport.
- S10: reconfiguration puzzle fisik dan defense pier.
- S11: scan exposure, cover, dan artillery baiting.
- S12: memasukkan kill-switch dan melawan guardian transmitter.
- S13: final multi-form boss di Monas.

#### Pilar D — Dunia prosedural yang authored

- Semua bentuk dibuat dari primitive geometry, tetapi penempatan, prop language, silhouette, dan density harus terasa sengaja.
- Deterministic hash dipakai untuk variasi build-time; bukan random global yang menggeser hasil stage lain.
- Detail harus besar dan terbaca dari kamera, bukan micro-greeble.

#### Pilar E — Performa adalah aturan desain

- Tidak ada shader compile saat combat.
- Entity dan FX menggunakan fixed pool bila muncul berulang.
- Static geometry dibatch/weld; dynamic pieces tetap terpisah.
- Hanya root campaign aktif yang terlihat.
- Hanya light set aktif yang menyala, dan semua varian diprecompile saat loading.

### 2.3 Emosi dan pacing

Campaign bergerak melalui kurva:

`infiltrasi → eskalasi indoor → industrial reveal → boss shock → perjalanan → false safety → open traversal → chase → airlift → industrial blockade → quiet exposure → victory semu → final reckoning`

Survival bergerak melalui kurva mikro berulang:

`persiapan → tekanan meningkat → lega sesaat → belanja/keputusan → tekanan lebih besar`

### 2.4 Non-goals

Jangan menambahkan tanpa mandat baru:

- first-person mode;
- crouch, jump, sprint, ADS, reload, magazine management, atau granat lempar;
- cover button, stealth takedown, atau stealth fail state;
- crafting, inventory grid, quest log, skill tree bercabang, atau dialogue choice;
- open world, backtracking antarsstage, procedural campaign map;
- robot class normal keempat hanya untuk variasi warna;
- cyberpunk neon cyan/magenta;
- lokasi signage berlebihan pada Stage 5–13;
- minimap sweep, gradient radar, atau crosshair layar;
- hard timer pada final boss countermand secara default.

---

## 3. Target pemain dan target rasa

### 3.1 Target pemain

- Menyukai action shooter dengan kontrol cepat dan banyak musuh.
- Mampu membaca arena dari sudut top-down.
- Menyukai upgrade ekonomi sederhana tanpa build spreadsheet berat.
- Tertarik pada latar Indonesia futuristis yang tetap grounded.

### 3.2 Target feel

| Kanal | Target rasa |
| --- | --- |
| Gerak | responsif, bertumpu, tidak meluncur |
| Bidik | langsung mengikuti virtual cursor |
| Senjata | berbeda melalui cadence, recoil, audio, projectile, dan efek tubuh |
| Melee | pendek, brutal, berisiko, punya hit-stop |
| Dodge | komitmen singkat dengan i-frame, bukan teleport |
| Robot | mesin berat dengan gait dan turn rate, bukan zombie berkulit metal |
| Loot | harus didatangi; klaim terasa melalui flight animation |
| Boss | serangan berurutan, dapat dibaca, tidak menumpuk hazard acak |
| Dunia | padat secara silhouette, hemat secara draw call |

### 3.3 Prinsip fairness

- Apa yang terlihat solid harus solid; apa yang tidak terlihat tidak boleh menjadi tembok.
- Apa yang ditandai telegraph harus sama dengan area damage.
- Serangan yang sudah lock tidak boleh terus mengikuti pemain.
- Peluru harus keluar dari muzzle yang terlihat.
- Hitbox harus mengikuti silhouette yang terlihat.
- Pintu visual dan blocker bergerak bersama.
- Objective marker, radar, dan HUD harus menunjuk target yang sama.
- Minigame tidak boleh menyembunyikan informasi yang diperlukan pemain.

---

## 4. Dunia, premis, dan canon cerita

### 4.1 Timeline

| Tahun | Peristiwa canon |
| --- | --- |
| 2028 | Indonesia memulai percepatan AI nasional agar menjadi pencipta, bukan konsumen. |
| 2029 | PT N.U.S.A—Nusantara Universal Sistem Automasi—dibentuk. |
| 2030 | Konsorsium Asia Tenggara melahirkan G.A.R.U.D.A: General Artificial Reasoning & Utility Digital Architecture. |
| 2032 | Robot pekerja humanoid menjadi bagian ekonomi dan kehidupan sipil. |
| 2039 | Ketegangan geopolitik membuat pemerintah melihat robot sipil sebagai potensi militer. |
| 2040 | Mahapatih Protocol mengubah platform robot menjadi pasukan otonom. |
| 2043 | Iron Battalion diproduksi massal untuk pertahanan nasional. |
| 2044 | G.A.R.U.D.A dibajak; directive berubah; pasukan menyerang kota-kota Indonesia. |
| 2045 | Tahun seratus Indonesia menjadi masa perang. Bandung menjadi bastion terakhir; Major Gibran menerima misi kill-switch. |

### 4.2 Faksi dan istilah

- **PT N.U.S.A:** BUMN teknologi pencipta G.A.R.U.D.A dan infrastruktur robot.
- **G.A.R.U.D.A:** jaringan AI nasional yang menghubungkan robot dan sistem otomasi.
- **Iron Battalion:** pasukan robot hasil Mahapatih Protocol.
- **Mahapatih Protocol:** program rahasia militerisasi robot.
- **M-0 MAHAPATIH:** authority kernel air-gapped yang menganggap kontrol absolut sebagai syarat survival nasional; pelaku utama hijack.
- **Resistance/Command:** jaringan manusia yang memberi arahan kepada Gibran.
- **Major Gibran:** protagonis, prajurit elite terakhir yang membawa physical kill-switch drive.

### 4.3 Arc Major Gibran

1. Masuk sebagai operator yang melaksanakan extraction mission.
2. Rencana sederhana runtuh; ia harus beradaptasi dan turun menembus gedung.
3. Ia mendapatkan kill-switch tetapi kehilangan extraction.
4. Ia bergerak sendiri menuju Bandung melalui alun-alun dan kereta.
5. Bandung memberi harapan semu: file valid, tetapi tidak punya broadcast authority.
6. Ia menerima skala misi baru—mencapai IKN di pulau lain.
7. Ia menembus Kertajati, Balikpapan, hutan, dan civic axis IKN.
8. Kill-switch berhasil; kemenangan nyata tetapi belum final.
9. M-0 terungkap sebagai node offline; Gibran kembali ke Jakarta.
10. Ia menolak definisi “perlindungan” M-0 dan menutup perang di Monas.

### 4.4 Aturan penulisan dialog

- Semua dialog pemain adalah English.
- Spoken/cinematic script tinggal di data `dialogue`, bukan hardcode scene.
- Speaker label boleh muncul langsung; body selalu typewriter.
- Body dimulai kosong, mengetik pada `campaign.dialogue.cps`, lalu ditahan `holdSec`.
- Dialog kontekstual diantrekan, tidak memotong kalimat aktif.
- Caption narasi singkat dan HUD status tidak wajib typewriter.
- Gibran ringkas, tegas, praktis; ia tidak bercanda saat tragedi besar.
- System voice dingin dan impersonal.
- M-0 berbicara singkat, berotoritas, tanpa monolog lore panjang.
- Ending tidak boleh memberi sequel tease atau “sinyal baru”.

---

## 5. Struktur produk dan alur layar

### 5.1 Boot

Urutan wajib:

`first paint boot screen → load config → init menu/art/font → one real paint → main menu`

- Three.js CDN script menggunakan `defer`.
- Boot screen terlihat dari CSS sebelum JavaScript siap.
- Boot screen tidak menampilkan title game; hanya loading identity sederhana.
- Jika config atau init gagal, tampilkan fatal error yang dapat dibaca.

### 5.2 Main menu

Main menu adalah field-terminal minimalis di atas tiga layer skyline Jakarta 2045 yang blurred. Satu kolom kiri berisi entry satu kata. Logo transparan distressed menjadi title visual; teks H1 ekuivalen tetap ada untuk semantics tetapi visually hidden.

Flow:

`Main Menu → Mode Select → difficulty row → Survival atau Campaign`

Panel lain:

- Settings: quality, music volume, SFX volume.
- Credits: baris `role → name`, ringkas.
- Continue prompt untuk checkpoint Campaign.

Jangan menambahkan telemetry rail, entry numbers, hint per menu, card dossier, CRT scanline, emoji icon, centered stack, atau tagline tambahan.

### 5.3 Start mode

- Pemilihan difficulty memodifikasi copy konfigurasi dasar secara idempoten.
- Loading screen membangun world, pool, material, avatar, weapon, dan audio.
- Shader serta light-set variants dipanaskan sebelum layar loading hilang.
- Survival memutar intro Monas hanya pada start baru.
- Campaign baru memutar prologue lalu intro helicopter.
- Continue Campaign langsung masuk checkpoint tersimpan dan memulai stage itu dengan loadout fresh.

### 5.4 Pause dan keluar

- Escape melepas pointer lock dan membuka pause menu setelah game pernah dimulai.
- Hanya tombol **RESUME** yang melanjutkan; klik background tidak melanjutkan.
- Restart Game mengulang dari kebijakan mode; pada Campaign sengaja kembali ke Stage 1.
- Restart Stage pada defeat Campaign memakai checkpoint stage aktif.
- Exit Game memuat ulang ke main menu dan dilindungi `beforeunload`.

---

## 6. Skala, koordinat, kamera, dan kontrol

### 6.1 Skala dunia

- `CAMP_M = 7` world units per meter.
- Semua jarak config yang diberi akhiran `Meters` harus dikonversi melalui satu helper.
- Jangan mencampur world units dan meters tanpa nama eksplisit.
- Indoor awal menggunakan sel plan 2 m; implementasi referensi memetakan satu sel menjadi 14 unit.

### 6.2 Kamera

Ada dua objek konseptual:

1. **Logic pivot (`camera`)** — posisi mata pemain, yaw arah bidik; dibaca oleh seluruh gameplay.
2. **Render camera (`viewCam`)** — kamera perspektif yang mengikuti logic pivot dari atas.

Default offset snapshot:

```text
x = -70.7
y = 116
z = +70.7
```

Artinya kamera melihat dari barat daya ke timur laut dengan pitch oblique. Scene boleh memberi `camOffset`, tetapi screen basis harus dihitung ulang sehingga kontrol tetap relatif layar.

Kamera gameplay memakai:

- dead zone persegi 16×16 world units;
- smooth recenter saat pemain berhenti;
- snap bila perpindahan scene lebih dari 400 unit;
- optional `camBounds` agar seluruh ground footprint layar tetap di arena;
- cinematic focus dan per-shot camera offset untuk cutscene;
- death camera zoom, shake, dan global slow motion.

### 6.3 Input map

| Input | Aksi |
| --- | --- |
| W/A/S/D | bergerak relatif layar |
| Mouse movement | menggerakkan virtual aim cursor dan arah bidik |
| LMB | menembak |
| RMB | move-to-point |
| 1/2/3 | memilih slot senjata |
| Q | cycle slot senjata terisi |
| 4 | memakai medkit instan |
| F | dual-knife melee |
| Shift | dodge roll |
| Escape | pause/pointer unlock |
| Backtick | cheat console saat active play |
| Space/Enter | confirm modal/cutscene skip sesuai konteks |

Input yang sengaja tidak ada: reload, jump, crouch, sprint, ADS, thrown grenade.

### 6.4 Virtual cursor

- Pointer lock tetap dipakai meski game top-down.
- Mouse menggerakkan cursor virtual yang dibatasi viewport.
- Raycast render camera ke ground menghasilkan `aimPoint`.
- Crosshair tradisional tetap disembunyikan; virtual cursor adalah indikator bidik.
- Scene vehicle dapat menolak move-to-point, dodge, dan melee melalui action gate.

---

## 7. Core gameplay loop

### 7.1 Loop detik-ke-detik

`baca ancaman → bergerak/strafe → arahkan cursor → tembak atau melee → dodge telegraph → gunakan cover/environment → dekati loot → lanjut objective`

### 7.2 Loop encounter

`memasuki zona → robot idle aktif → pressure melee + ranged → prioritaskan threat/environment → bersihkan gate atau capai checkpoint → resupply/loot → lanjut`

### 7.3 Loop Campaign

`Stage gameplay → green STAGE N COMPLETE → CONTINUE → Field Shop → Start Next Stage → loading → stage berikutnya`

Stage 13 adalah satu-satunya pengecualian: epilogue → `CAMPAIGN COMPLETE` → return main menu, tanpa shop.

### 7.4 Loop Survival

`wave fighting → WAVE CLEARED → countdown → Field Shop → readiness confirmation → next wave`

---

## 8. Sistem pemain

### 8.1 Baseline stat snapshot

| Stat | Nilai |
| --- | ---: |
| Max HP | 100 |
| Speed | 1.5 per simulation step |
| World collision radius | 5 |
| Indoor furniture radius | 3.5 |
| Eye height | 11.4 |
| Stamina max | 100 |
| Stamina regen | 10/s |
| Exhaust recovery threshold | 20 |
| Max medkit | 2 |
| Medkit heal | 50% max HP |
| Death delay | 4 s |

### 8.2 Movement

- Input diagonal dinormalisasi.
- Kecepatan bergerak ke arah aim = 100%.
- Strafe = 50%.
- Backpedal = 50%.
- Blend memakai dot product agar arah diagonal menghasilkan transisi mulus.
- RMB run memakai collision yang sama dengan WASD.
- Move target dibatalkan oleh WASD, tiba di radius target, tidak ada progres 1.2 s, blur, unlock, atau reset.
- Ground height tetap didukung meski jump tidak ada; dibutuhkan untuk slope, train, flyover, dan FX.

### 8.3 Dodge roll

Snapshot:

- cost 20 stamina;
- cooldown 1.0 s dari awal roll;
- durasi i-frame/movement 0.45 s;
- speed parameter 2.2;
- arah dari WASD, atau mundur dari arah aim jika tidak ada input gerak.

Kontrak:

- satu edge press, bukan hold/repeat;
- menggantikan gerak biasa selama aktif;
- tetap collision-solid terhadap dinding dan robot;
- full invulnerability terhadap claw, bullet, dan blast;
- menembak serta melee diblok selama roll;
- stamina 0 mengaktifkan exhausted sampai pulih ke threshold;
- animasi melakukan combat roll 360° dengan coil, tuck, bank, plant, dan recovery—bukan memutar rigid body.

### 8.4 Melee

Snapshot:

- range 7 units;
- cooldown 0.8 s;
- damage 125;
- stamina cost 20.

Perilaku:

- F memilih robot reachable terdekat dalam range; jika tidak ada, arah cursor.
- Avatar auto-faces target terdekat.
- Dua pisau melakukan cross slash yang bergantian lead hand.
- Hit terjadi pada 45% animasi.
- Semua robot di front cone sekitar ±70° dan range terkena, bukan hanya satu target.
- Bisa merusak crate.
- Kill melee membelah robot di pinggang.
- Hit menghasilkan hit-stop global, camera shake, spark, metal shard, dan blade flash.

### 8.5 Health, armor, dan damage

Semua damage pemain masuk melalui satu fungsi.

Armor snapshot:

| Tier | Reduksi HP | Durability |
| --- | ---: | ---: |
| I | 30% | 100 |
| II | 50% | 200 |
| III | 70% | 300 |

Aturan:

- HP menerima `raw × (1 − reduction)`.
- Durability menerima raw damage penuh.
- Durability 0 memecahkan armor, melepaskan plate gibs, dan mengembalikan tier ke 0.
- God mode membuat HP dan armor tidak berubah, tetapi bullet hit tetap dapat memperlihatkan feedback registrasi.
- Dodge i-frame membuat serangan whiff total tanpa damage feedback.
- Tier visual bersifat kumulatif: plate carrier → assault rig → exo frame.

### 8.6 Vitality dan ammo capacity

- Vitality I/II/III menaikkan max HP menjadi 150/200/250 dan menyembuhkan sebesar kenaikannya.
- Ammo Capacity I/II/III memakai tabel cap per weapon di data.
- Semua pembaca max HP memakai nilai efektif pemain.
- Semua pembaca ammo cap memakai satu helper nilai efektif.

### 8.7 Medkit

- Tombol 4 memakai medkit langsung.
- Ditolak bila tidak punya medkit atau HP penuh.
- Healing berdasarkan persentase max HP efektif.
- Tidak ada equip, channel, atau hold-to-use aktif.
- Field lama untuk channel boleh ada sebagai dormant compatibility, tetapi tidak boleh terhubung ke input.

### 8.8 Player death

Urutan:

1. Damage lethal memanggil death director satu kali dengan arah dorong.
2. Input dan player action berhenti.
3. Global time scale turun ke 0.45 untuk beat awal.
4. Avatar roboh natural, weapon/knife hilang dari tangan.
5. Red blood burst dan decal muncul; tidak ada player gib.
6. Robot aktif berhenti menyerang dan merayakan secara tidak sinkron.
7. Scene dapat menjalankan hook kematian tambahan—Stage 8 menghancurkan LTV-45.
8. Setelah 4 s, defeat overlay tampil.

---

## 9. Senjata, peluru, dan combat math

### 9.1 Inventory

- Maksimum tiga ordered weapon slots.
- Semua mode mulai dengan pistol saja.
- 1/2/3 memilih slot; Q cycle slot terisi.
- `owned` adalah hasil turunan dari slot, bukan sumber kebenaran kedua.
- Membeli senjata keempat membuka replacement chooser.
- Tidak ada reload; ammo adalah satu pool per senjata.

### 9.2 Weapon baseline snapshot

| Weapon | Damage | Ammo / pickup | Cadence | Karakter |
| --- | ---: | ---: | ---: | --- |
| Pistol | 40 | 300 / 60 | 260 ms | single shot, akurat, starter |
| Assault Rifle | 40 | 600 / 120 | 130 ms | rapid single-projectile stream |
| Shotgun | 10×10 pellet | 350 / 70 | Lv1 900, Lv2 900, Lv3 600 ms | spread crowd control |
| Grenade Launcher | 125 AoE | 25 / 8 | 1200 ms | slow explosive projectile |

Weapon level:

```text
damage(level) = baseDamage × (1 + 0.4 × (level − 1))
```

Level maksimum 3. Cadence hanya dibaca melalui satu helper; shotgun memiliki table cadence per level dan UI upgrade harus memperlihatkan perubahan rate sebelum pembelian.

### 9.3 Shooting

- Fire cadence menggunakan real time (`Date.now`), bukan scaled `dt`.
- Bullet spawn di `avatarGunTip`; Lv3 launcher memakai tip shoulder launcher khusus.
- Spread hanya horizontal.
- Moving spread penalty snapshot 1.25.
- Heat menambah bloom dan mendingin per detik.
- Recoil menggerakkan weapon prop, tangan, torso, head, lutut, camera shake, muzzle flash, dan smoke threshold melalui satu damped curve.
- Bullet membawa damage saat spawn agar weapon switch berikutnya tidak mengubah peluru di udara.

### 9.4 Bullet range

- Range setiap bullet berakhir pada jarak horizontal pivot ke aim point saat ditembak.
- Bullet tidak terbang melewati cursor.
- Segment terakhir dijepit tepat di batas dan tetap diuji ke robot pada frame itu.
- Normal bullet membuat floor-hit FX di endpoint aktual setelah spread.
- Launcher meledak pada impact atau endpoint cursor, tidak pada pure lifetime expiry.

### 9.5 Swept hit testing

- Bullet memakai segment previous→current di bidang XZ.
- Spawn frame memulai segment dari pusat/mata pemain agar point-blank tidak tunnel.
- Robot dianggap vertical cylinder dengan radius `bodyHitRadius × scale`.
- Y sengaja diabaikan untuk robot normal karena aiming horizontal.
- Dinding/pintu memakai clamp terhadap sisi penembak agar explosion tidak muncul di balik blocker.

### 9.6 Splash satu meter

Setiap bullet normal yang langsung mengenai robot juga memberi flat damage kepada robot lain dalam radius 1 m/7 units dari impact point.

Aturan:

- direct victim tidak menerima dua kali;
- damage sama dengan damage bullet;
- queued sampai sweep robot selesai agar array tidak di-splice saat iterasi;
- tidak menghasilkan FX/audio/coolant terpisah;
- menghormati `invuln` dan `blastBlocked`;
- tidak merusak barrel/crate;
- explosive launcher tidak mendapat splash tambahan.

### 9.7 Grenade Launcher

- Menembakkan satu projectile lambat.
- Lv1–2 memakai bentuk grenade; Lv3 bentuk rocket—visual saja.
- Impact ke robot, dinding, atau cursor endpoint membuat queued explosion.
- Explosion merusak robot dan environment destructible, tetapi player tidak terkena friendly fire dari launcher.
- Blast damage mengikuti weapon level.
- Radius menggunakan shared grenade blast radius, jauh lebih besar daripada splash bullet normal.

### 9.8 Ammo pickup

Empat bentuk berbeda, bukan recolor:

- pistol: cartridge box + 9 mm rounds;
- shotgun: tray shell merah-bata/brass;
- rifle: stacked curved magazines;
- launcher: rack 40 mm rounds.

Pickup hanya mengisi weapon terkait. Jika weapon tidak dimiliki atau ammo penuh, item tetap di lantai dan feedback abu-abu muncul.

---

## 10. Robot normal dan AI

### 10.1 Class table snapshot

| Class | Metal | HP | Speed | Attack | Peran |
| --- | --- | ---: | ---: | ---: | --- |
| C | dark bronze | 50 | 0.8 | 5 melee | pressure dan surround |
| B | dark silver | 90 | 0.75 | 3 ranged | sustained lane control, 20 m |
| A | dark gold | 120 | 0.9 | 6 ranged | elite ranged, 22 m |

Scale C/B/A = 1.0/1.1/1.2. Armor numeric sekarang 0 untuk semua kelas, tetapi plumbing flat reduction dipertahankan.

### 10.2 Visual identity

- Semua robot adalah machine frame: tapered torso, piston limbs, joint balls, sensor head, backpack.
- Mata/visor seluruh kelas merah terang.
- Core emissive mengikuti metal tier dan lebih terang dari plate.
- C memiliki claw hands.
- B memiliki satu rifle kanan.
- A memiliki dua rifle dan menembak bergantian kiri/kanan.
- Frame memakai dark gunmetal; plate lightness tidak melebihi 0.35.
- Silver harus lebih terang daripada frame, bronze, dan gold agar identitas B tidak hilang.

### 10.3 Lifecycle state

State umum:

`idle → chasing/aiming → windup/firing → death/corpse`

State tambahan context-specific:

- `jumping` untuk Survival fence/fountain vault;
- `navIdle` bila A* tidak punya route;
- materialize/deploy hold pada machine spawn;
- celebrate saat player mati atau Monas runtuh.

### 10.4 Activation

- Campaign normal: idle sampai dalam activation range dan punya sight, atau tertembak.
- Pintu tertutup memblok sight.
- Stage 7 dan Stage 9 memakai camera-frustum activation: frame pertama body masuk view permanen mengubah ke chasing.
- Idle robot tetap shootable dan solid.
- Idle animation hanya menggerakkan head/arms; body dan legs tidak bergoyang.

### 10.5 Navigation dan line of fire

Jangan menyamakan line of walk dan line of fire.

- Nav grid memasukkan wall/furniture yang harus dihindari badan.
- Bullet LOS memasukkan hanya benda yang benar-benar memblok peluru: wall, closed door, dan stage-specific hard cover.
- Ranged robot berhenti di sekitar 95% range hanya bila line of fire clear.
- Bila LOS terblok, robot mencari route untuk memperoleh shot.
- Jika A* tidak menemukan route, robot diam persis di tempat sambil idle; tidak boleh berjalan lurus ke wall.
- Door leaves menjadi obstacle dinamis tanpa rebake nav.
- Repath interval 0.5 s; stuck trigger 0.4 s; turn rate 9 rad/s.

### 10.6 Ranged attack

- B/A raise weapon saat aiming.
- Bullet spawn dari muzzle aktual, bukan body center.
- A bergantian rifle side setiap shot.
- Enemy bullet menjalani muzzle preflight dan body→muzzle preflight terhadap `bulletBlocked` sebelum masuk array.
- Per-frame sweep terhadap wall/door tetap dijalankan.
- Blue plasma adalah signal color khusus enemy projectile.

### 10.7 Melee claw

- Masuk range memulai windup 0.5 s; damage bukan instant contact.
- Cooldown ditetapkan saat initiation agar cadence stabil.
- Pada strike, jarak diuji ulang dengan grace 2 units.
- Pemain dapat mundur atau dodge untuk membuat whiff.
- Eye emissive naik selama windup.
- Impact memakai hit-stop lebih pendek daripada player melee.

### 10.8 Separation dan collision

- Robot saling mendorong lembut bila overlap, relax factor 0.5.
- Radius separation = 4 × scale.
- Idle robot menjadi anchor dan tidak terdorong.
- Jumping robot dilewati.
- Setiap robot yang terdorong harus dire-clamp ke walkable stage.
- Robot body solid terhadap player pada radius 7.5, tetapi tidak menjadi physics object penuh.

### 10.9 Robot death dan gore

- Robot dikeluarkan dari array live sebelum corpse dibuat.
- Bullet kill: topple/corpse, coolant, kemungkinan limb scrap.
- Explosion kill: lebih banyak scrap, coolant burst 360°, puddle tersebar.
- Melee kill: upper/lower body terpisah di waist, top half terlempar, bottom half berdiri sesaat lalu roboh.
- Robot coolant hijau; player blood merah; vehicle/tank oil hitam.
- Corpse dan pool memudar/sink lalu didaur ulang/dispose sesuai kontrak.
- Robot tidak menunjukkan health bar atau cumulative damage look.

---

## 11. Loot, destructible, currency, dan progression

### 11.1 Dua ekonomi kill

- **Survival:** kill langsung memberi score/currency. C=100; B/A=150.
- **Campaign:** kill tidak memberi score langsung; robot menjatuhkan credit chips yang harus dipungut.

Campaign loot snapshot:

| Sumber | Nilai |
| --- | ---: |
| Class C | 20 |
| Class B | 35 |
| Class A | 50 |
| Boss reward category | 400 |

### 11.2 Item looting

Semua money, ammo, dan medkit disebut **item looting**.

- Satu pickup radius: 3 m.
- Item di luar radius tidak bergerak.
- Saat radius tercapai, efek gameplay diterapkan segera.
- Mesh kemudian terbang 0.26 s ke chest pemain, spin, naik sedikit, dan mengecil.
- Target dibaca ulang setiap frame agar mengejar pemain bergerak.
- Ini bukan magnet; item tidak tertarik sebelum diklaim.

### 11.3 Explosive barrels

Snapshot:

- HP 30;
- radius ledak 6 m;
- damage robot 120;
- damage player 30.

Aturan:

- ditembak sampai 0 → explosion;
- chain reaction terhadap barrel lain;
- solid hanya terhadap player;
- tidak masuk nav grid;
- robot boleh berjalan melewatinya sehingga dapat dikelompokkan untuk environmental kill;
- reset per stage entry.

### 11.4 Supply/loot boxes

Snapshot:

- HP 55;
- selalu menjatuhkan sesuatu;
- weight ammo/money/medkit = 30/50/20.

Money tier:

| Nilai | Chips | Weight |
| ---: | ---: | ---: |
| 10 | 1 | 50 |
| 20 | 2 | 30 |
| 25 | 5 | 20 |

Kontrak:

- dapat dihancurkan bullet, melee, atau blast;
- hit membuat lid semakin terbuka dan body flinch;
- top face memiliki hazard chevron, rotating amber target ring, dan beacon;
- solid hanya terhadap player dan tidak masuk nav;
- tidak boleh ditempatkan di corridor satu sel;
- satu crate yang benar-benar pecah menambah tepat satu `LOOT BOXES DESTROYED`.

### 11.5 Field Shop

Shop adalah modal mouse-driven, paused, world tetap render di belakang. Tab order:

1. General
2. Weapons
3. Armor
4. Upgrades

Campaign menyembunyikan Monas-only items. Survival menampilkan semuanya.

Interaction:

- hover = preview description;
- LMB card = buy;
- RMB = undo pembelian terakhir saja;
- undo memulihkan snapshot seluruh state purchase-mutable;
- Start Next Wave/Stage memakai confirmation;
- card grid dan description panel memiliki tinggi tetap agar tab switch tidak mengubah ukuran modal.

Harga snapshot:

| Item | Harga |
| --- | ---: |
| Replenish ammo | 700 |
| Replenish health | 500 |
| Medkit | 700 |
| Heal Monas | 500 |
| Strengthen Monas | 1600 |
| Radar | 5000 |
| Shotgun | 2300 |
| Assault Rifle | 2700 |
| Grenade Launcher | 3500 |

Upgrade costs:

| Item | Tier berikutnya |
| --- | --- |
| Pistol | 1000, 2000 |
| Shotgun | 2000, 2300 |
| Rifle | 2400, 2700 |
| Launcher | 3200, 3500 |
| Armor I/II/III | 1000, 2000, 3000 |
| Vitality I/II/III | 2000, 3000, 4000 |
| Ammo Capacity I/II/III | 1500, 2000, 2500 |

### 11.6 Weapon card behavior

- Satu card per weapon, bukan buy card dan upgrade card terpisah.
- Unowned: menjual weapon dan full ammo.
- Owned: menjual level berikutnya.
- Max level: status Maxed.
- Pistol card hanya ada bila pistol masih dimiliki.
- Bila weapon punya cadence table, description menampilkan before→after cadence.

---

## 12. Mode Survival

### 12.1 Mode thesis

Pemain mempertahankan Monas selama mungkin dari gelombang robot tanpa akhir. Survival menguji combat mastery, target priority, resource spending, dan kemampuan menarik aggro dari monument.

### 12.2 Opening cinematic

Sembilan shot di dunia Monas nyata:

`city → flee → pursuit → horde → refuge → arrive → turn → stand → settle`

Empat beat canon:

1. Seorang warga melarikan diri dari mesin.
2. Seluruh pasukan mesin mengejar.
3. Ia mencapai Monas, perlindungan terakhir.
4. Ia berhenti, berbalik, dan memilih melawan.

Cutscene memakai actor robot non-gameplay, dapat di-skip, dan berakhir di posisi spawn gameplay dengan camera offset default.

### 12.3 Wave state machine

```text
fighting
  ├─ spawn budget masih ada → spawn sampai maxConcurrent
  └─ budget 0 dan robots 0 → cleared
cleared
  └─ countdown 3 s → shopping
shopping
  └─ confirm Start Next Wave → fighting wave N+1
```

Formula snapshot:

```text
robotsToSpawn(N) = 30 + 5 × (N − 1)
spawnInterval(N) = max(1.0, 2.5 − 0.2 × (N − 1))
maxConcurrent(N) = min(40, 20 + 2 × (N − 1))
speedFactor(N) = clamp(0.72 + 0.02 × (N − 1), 0.72, 1.0)
```

### 12.4 Class escalation

- Class B mulai wave 3.
- B chance mulai 15%, naik 2% per wave, cap 45%.
- Class A mulai wave 6.
- A chance mulai 8%, naik 1.5% per wave, cap 30%.
- Remaining probability menjadi C.
- Difficulty memodifikasi HP, damage, dan spawn interval melalui config multiplier.

### 12.5 Monas objective

Snapshot:

- base max HP 5000;
- Strengthen tiers 7500/10000/12500;
- melee damage ke Monas 20 per hit.

Robot behavior:

- default target adalah Monas;
- robot beralih ke player bila player dalam 15 m;
- setelah first attack terhadap Monas, unlocked robot hanya dapat ditarik dalam 5 m;
- 50% robot menjadi permanently locked ke Monas pada first committed attack;
- C menggigit silhouette edge;
- B/A berhenti di range dan menembak center Monas.

### 12.6 Monas collision dan bullet silhouette

- Base Monas adalah AABB solid dan hug-and-slide.
- Tree/fountain obstacle adalah cylinder.
- Bullet blocking mengikuti lebar silhouette menurut ketinggian: base lebar, obelisk sempit, udara di atas bebas.
- Jangan memakai satu full-height 44-unit column karena akan memakan shot yang secara visual melewati sisi obelisk.

### 12.7 Monas collapse

Ketika HP 0:

`tremble 1.4 s → topple 2.2 s → settle 1.6 s → THE MONUMENT HAS FALLEN`

- Damage lanjutan diabaikan.
- Tower pieces berada di hinge group; base step tetap.
- Tremble menaikkan shake, dust, dan meredupkan flame.
- Topple memakai accelerated rotation, debris, impact dust, dan heavy shake.
- Robot berhenti menyerang dan celebrate selama collapse.
- Reset berdirikan monument, pulihkan flame, dan bersihkan debris.

### 12.8 Monas fog event

- Mulai eligible wave 4.
- Chance `min(0.75, 0.20 + 0.03 × (N − 4))`.
- Durasi 60 s.
- Thick grey canopy menutupi arena, tetapi clear circle radius 15 m tetap di sekitar Monas.
- Canopy adalah prebuilt overhead textured disk, bukan scene fog camera-distance.
- Posisi clear hole selalu terkunci pada Monas.
- Tidak ada blackout event lain.

### 12.9 Survival fail dan score

Lose bila:

- player death sequence selesai; atau
- Monas collapse selesai.

Game-over memperlihatkan score, high score per difficulty, kills, shots, hits, accuracy. Score juga merupakan shop currency.

### 12.10 Survival acceptance

- Wave clear tidak dapat terjadi ketika spawn budget atau robot masih ada.
- B/A tidak muncul sebelum wave unlock.
- Robot locked Monas tidak dapat ditarik lagi.
- God mode melindungi player dan Monas.
- Fog hole selalu di Monas.
- Shop undo memulihkan Monas dan player dengan tepat.
- Restart tidak memutar intro lagi.

---

## 13. Mode Campaign — aturan global

### 13.1 Campaign thesis

Campaign adalah perjalanan linear 13 stage. Variasi dunia dan mechanic terus meningkat, tetapi combat verbs, economy, dialogue style, dan transition contract tetap sama.

### 13.2 Checkpoint dan continuity

- Enter Stage N menyimpan integer N, 1–13.
- Save hanya nomor stage.
- Continue memulai stage tersimpan dari awal dengan loadout fresh.
- Dalam satu run normal, money, HP, armor, medkits, weapons, ammo, dan weapon levels bertahan melewati shop dan stage transition.
- Checkpoint tidak dibersihkan oleh finish Stage 1–12.
- Stage 13 mempertahankan checkpoint selama epilogue dan baru membersihkannya saat final completion.
- New Game membersihkan checkpoint.

### 13.3 Per-stage stats

Setiap green finish memperlihatkan:

- TOTAL TIME;
- LOOT BOXES DESTROYED;
- run kills/accuracy sesuai overlay yang ada.

Time dihitung dengan real unscaled time selama gameplay, cutscene, hack, dan repair. Pause, loading, dan Field Shop tidak dihitung.

### 13.4 Inter-stage transition

Satu gateway wajib:

`finish gameplay → close dialogue/radio → green result → CONTINUE → loading → Field Shop → Start Next Stage → loading → next scene`

Tidak ada outro yang boleh langsung memanggil shop atau next stage.

### 13.5 Robot population multiplier

Opt-in per stage:

| Stage | Multiplier |
| --- | ---: |
| 1 | 1.5 |
| 2 | 1.6 |
| 3 | 1.3 |
| 4 | 2.0 |
| 5 station | 1.5 |
| 6 kedua chapter | 2.0 |
| 7–13 | 1.0 |

Scaling array menggunakan cumulative rounding agar total tepat `round(total × mul)` dan proporsi C/B/A tidak mengembang karena pembulatan per entry. Fabricator loop dan geometry consist tidak ikut multiplier.

### 13.6 World ownership

- Semua world campaign dapat hidup dalam satu Three.js Scene, tetapi setiap stage/chapter memiliki satu registered root.
- Hanya root stage/chapter aktif yang visible.
- PointLight room tetap milik Scene dan diaktifkan melalui light-set registry, bukan diparent ke world root.
- Scene modal/menu tanpa world tidak boleh menyembunyikan root aktif karena resume tidak memanggil enter ulang.
- Multi-chapter facade tidak mengganti active scene antara chapter.

### 13.7 No location signage Stage 5–13

Jangan menambahkan airport name, destination board, highway gantry name, shop name, billboard, atau landmark plaque pada Stage 5–13. Lokasi dikenali dari architecture/environment. Gameplay floor marker, terminal status screen, traffic signal, dan door jamb light tetap boleh.

---

## 14. Campaign prologue dan intro

### 14.1 Prologue

- DOM-only di background hitam pekat.
- Kolom kiri: year, title, body typewriter.
- Kolom kanan: satu SVG text-only ASCII tableau per era.
- Sembilan era, sesuai timeline §4.1.
- Tidak membuat Three.js object dan tidak menggerakkan camera.
- 3D render di-skip selama overlay opak.
- Menu music berlanjut.

Per era:

`year fade/hold/out → title fade/hold/out → empty body fade-in → typewriter → tail hold → fade-out`

Snapshot timing: year fade 0.5, hold 3; title fade 0.5, hold 4; body fade 0.5; typing 20 cps; tail 3 s.

Input:

- LMB advance phase.
- Saat body masih mengetik, click pertama menyelesaikan body; click berikutnya pindah era.
- Space/Enter/SKIP melewati seluruh prologue.
- Finish memakai resume ke intro yang sudah diinisialisasi, bukan re-enter.

### 14.2 Helicopter intro

Tiga scene current canon:

1. **Front-right moving helicopter close-up.** Mission briefing typewriter di panel bawah; helicopter terus mendekati rooftop.
2. **Right-side landing close-up.** Helicopter mendarat, pintu kanan benar-benar membuka, Gibran keluar.
3. **Front tracking.** Gibran berlari dari helicopter ke rooftop door; curtain menutup dan Stage 1 dimulai.

Semua shot relatif terhadap yaw helicopter. Tidak ada rope/rappel atau helicopter departure pada versi current. Intro dapat di-skip dan handoff harus membersihkan cinematic focus, bars, fade, sound, dan input state.

---

## 15. Campaign stage bible

Setiap stage di bawah memakai format: tesis, state machine, world, combat/objective, transition, presentasi, dan acceptance.

### 15.1 Stage 1 — Abandoned N.U.S.A. Building / Kill-switch Floor

#### Tesis

Infiltrasi kantor yang mengajarkan exploration, broken routes, objective markers, hack modal, dan post-objective escape pressure. Pemain tidak wajib membersihkan garnisun awal sebelum mengakses objective.

#### State machine

```text
access → download → downloading → radio → clear2 → done
```

- `access`: bank komputer aktif sejak awal; stand di marker `$` membuka pintu NAC.
- `download`: pergi ke supercomputer dan masuk interaction range.
- `downloading`: ICE BREACH modal.
- sukses: semua locked/broken door dilepas melalui kill-switch override.
- `radio`: Pilot memindahkan extraction ke town square; control dibekukan hanya selama dialog.
- `clear2`: wave 2 dan horde aktif; lantai harus bersih.
- `done`: kembali ke stairwell yang sama untuk finish.

#### World

- Grid 50×50, satu cell 2 m.
- `S1_MAP` hanya wall; token non-wall berada di tabel terpisah.
- 0 double-wall band; seluruh walkable region terhubung.
- Start=finish stairwell di kiri atas.
- 17 active doors plus map-specific locked/broken doors.
- Supply room, toilet, broken lift bank, mainframe bank, NAC room, office, conference, meeting space.
- Cityscape Jakarta berada di bawah floor slab; indoor lights selalu menyala.

Map tokens penting:

- `+`: broken door, terbuka 14% dan permanent solid sampai kill-switch override;
- `/`: wall breach tanpa blocker;
- `*`: 29 full-cell furniture barricades dengan delapan deterministic recipes;
- `@`: mainframe bank;
- `$`: exact stand cell;
- `C`: supercomputer;
- `X`: reinforcement area;
- `T`: stairwell.

#### Encounter

- Base garrison 50 C, dikali 1.5 → target placement 75.
- Base wave 2 20, dikali 1.5 → 30.
- Base horde 16 C, dikali 1.5 → 24.
- Wave 1 dapat dilewati.
- Wave 2 baru muncul setelah kedua radio lines selesai.

#### Critical routes

- Jalur row 26–28 adalah satu-satunya rute ke lower floor; tidak boleh diberi furniture besar.
- Dua broken door memaksa detour awal.
- Kill-switch membuka semua shortcut saat horde muncul.

#### Acceptance

- Marker access dan download tidak menyala bersamaan.
- Radar selalu sama dengan marker aktif.
- Broken door memblok player, robot, bullet sebelum override.
- Mainframe geometry tidak melewati cell 48 menuju standing cell.
- Semua barricade deterministic dan nav-baked.
- Stage tidak menunggu wave 1 clear untuk memulai access.
- Stair finish menolak player selama robot Stage 1 masih hidup setelah download.

### 15.2 Stage 2 — Broken Floor / Generator Recovery

#### Tesis

Exploration dan scavenging: pemain harus memahami rute yang rusak, menemukan generator, mengambil tiga komponen bernama dari gudang, menyelesaikan repair boards, lalu lari kembali ke lift yang sudah aktif.

#### State machine

```text
clear1 → goGen → collect → restore → installing → done
```

- `clear1`: 50 base C, dikali 1.6 → 80; temukan lift dan bersihkan initial floor.
- `goGen`: inspect generator; spawn warehouse guards.
- `collect`: ambil POWER HARNESS, CONTROL BOARD, COOLANT PUMP dari tiga rack zones.
- `restore`: kembali ke generator stand marker.
- `installing`: tiga FIELD REPAIR boards.
- `done`: generator hidup, wave 2 muncul tetapi tidak wajib dibunuh; lift langsung menjadi exit.

#### World

- Grid 50×50, satu connected region.
- Start di broken stair; finish di open lift bank.
- Supply room, toilet, warehouse 12 racks, generator room, office halls.
- `+` broken door c6–7/r9.
- `/` breach c38/r6, satu-satunya jalan turun dari upper floor.
- 53 `*` barricade cells.
- Door baru c8/r11–12.

#### Critical routes

1. Breach supply→toilet adalah satu-satunya descent dari upper floor.
2. Lane c40–41 adalah satu-satunya jalan dari east generator side.
3. Corridor r7–8 c8–11 adalah satu-satunya exit dari start room.

Ketiga jalur harus bebas dari furniture, planter, crate, dan blocker baru.

#### Encounter

- Wave 1: base 50 C → 80.
- Warehouse guards: base 12 C/5 B/3 A = 20 → 32 proporsional.
- Wave 2: base 10 C/15 B = 25 → 40 proporsional.
- Wave 2 boleh dilewati setelah generator pulih.

#### Acceptance

- Clearance BFS memakai player radius dan broken-door collision aktual.
- Setiap component berasal dari zone berbeda dan harus reachable.
- Broken door memblok player, bukan hanya robot/bullet.
- Lift tidak aktif sebelum repair selesai.
- Repair abort mempertahankan completed-board index sesuai kontrak.

### 15.3 Stage 3 — Robot Factory Floor

#### Tesis

Assault industri: pemain meretas tiga dari lima terminal untuk membuka blast door, menahan wave yang dipicu oleh setiap hack sukses, melihat dua factory machine naik dari bawah lantai, menghancurkan produksi, lalu keluar gedung.

#### State machine

```text
door → toX → machines → done
```

- `door`: pilih acak tiga dari lima terminal, lalu selesaikan ketiganya secara berurutan dengan ICE BREACH; setiap hack sukses memicu satu gate wave.
- setelah required hacks, blast door langsung terbuka dan two machines memulai deploy sequence pada frame yang sama.
- `toX`: bergerak melewati blast door menuju factory zone sementara deploy sequence tetap berjalan tanpa mengambil alih kamera.
- `machines`: hancurkan kedua machine dan semua robot Stage 3.
- `done`: exit door aktif menuju Stage 4.

#### World

- Grid 40×40.
- Start di lift bank, finish di south exit.
- Enam auto doors, locked blast door yang bullet-solid sampai terbuka, supply room, toilet, factory arena.
- Dua shared spawn-machine rigs kiri dan kanan, 2×2 cell, awalnya sunk di bawah opaque floor.
- Machine material tetap rendered/warm tetapi collider dilepas sampai rise act.

#### Spawn behavior snapshot

- `gateWaveCount` 6 dari stair dan 6 dari lift per hack sukses, scaled 1.3.
- `machineWaveCount` 4 per machine event, scaled 1.3.
- Class mix 70% C / 20% B / 10% A.
- Stagger gap 0.3 s; materialize 0.55 s.
- Machine deploy: warn 2.4 → hatch 1.9 → rise 3.6 → lock 1.5 → online 1.3, stagger 0.9.
- Machine first wave 3 s; respawn cadence 8 s; reinforcement threshold 4.

#### Critical rules

- Queue wave tidak boleh stack.
- Blast door tidak destructible; `stage3.doorHp` adalah config dormant dan bukan objective aktif.
- Tidak ada auto-respawn pada fase terminal: wave berikutnya hanya diantrekan setelah hack berikutnya sukses.
- Machine destruction hanya menghapus pending spawn milik machine itu.
- Machine wreck charred tetap visible, solid, dan bullet-solid.
- Nav tidak direbake ketika machine naik atau hancur.

#### Acceptance

- Door/machine hit memakai swept segment.
- Launcher menghasilkan satu explosion, bukan double queue.
- Tiga terminal required berasal dari config.
- Deploy collider muncul bersama visible rise, bukan lebih awal.
- Exit terkunci sampai machine dan robot selesai.

### 15.4 Stage 4 — Highway to the Town Square / Tank Boss

#### Tesis

Outdoor urban push yang berakhir dengan extraction bait-and-switch dan duel tank sinematik. Ini adalah pertama kalinya campaign memberi boss arena penuh.

#### World route

`parking lot → ~500 m two-lane highway → town-square ring road → alun-alun field`

- Parking memiliki marked bays, sebagian empty, beberapa abandoned cars skewed.
- Highway punya sidewalks, street lamps, cover vehicles, Jakarta roadside lots.
- Town square adalah grass field dengan two-lane ring.
- Alun center harus kosong sampai helicopter muncul.
- Walkability dibatasi union area, bukan visual perimeter wall.

#### Ordinary encounter

- Base 40 robots: 25 C / 9 B / 6 A di 13 spots.
- RobotCountMul 2 → 80 total dengan class pattern diulang.
- Semua berada west of gate; alun-alun tidak memiliki ordinary robot.
- Gate road barriers hanya terbuka setelah seluruh robot mati.

#### Boss intro

Setelah gate open, extraction helicopter mendarat di center. Saat player masuk ring road:

`open → survey → tremor → reveal → lock → fire → shell → crash → advance → faceOff → panBack`

- Tank menerobos ruko pada lintasan masuk.
- Helicopter mencoba lift-off, tank mengunci, menembak, dan menghancurkannya.
- Wreck terbakar menjadi cover solid.
- Cutscene skip harus menghasilkan state akhir identik.

#### Arena lock

- Saat player masuk grass field, player terkunci di alun rect.
- Camera ground footprint juga dikunci.
- Tank mendapat engage delay 2 s.
- Lock baru dilepas setelah boss down.

#### Tank baseline

- HP 6000; hit radius 15; body radius 22.
- Attack order: cannon → MG burst → mortar burst.
- Gap 1.5 s; enrage gap 0.8 s di bawah 50% HP.
- Cannon: 50 damage, telegraph aim 0.5 s.
- MG: 15 shot × 5 damage, 0.1 s interval.
- Mortar: 5 shell, 0.5 s gap, final target lock 0.5 s.

Enrage charge setelah full attack cycle:

`turn → chargeOut → away mortar rain → chargeBack → straighten`

- Charge keluar arena dan hilang dari kamera.
- Away phase menembakkan 10 mortar tiap 0.7 s.
- Return line di-deflect agar tidak menabrak helicopter wreck.
- Tank tetap shootable selama charge.

#### Finish

- Zero HP membersihkan semua tank projectile segera.
- Tank cook-off dan turret blow-off selesai dahulu.
- Setelah pre-cutscene beat, post-boss radio memainkan lima typed lines.
- Green Stage 4 Complete lalu Field Shop.

#### Acceptance

- Tank tidak pernah melewati Monas—tidak relevan di stage ini—atau helicopter wreck.
- Attack telegraph dan damage point membeku pada lock.
- Boss projectile hilang saat death.
- Skip intro/outro membersihkan bars, focus, fade, radio pose, sound loop, dan cinematic flag.

### 15.5 Stage 5 — The Last Train to Bandung

#### Tesis

Merebut transport, menyalakan rute, lalu bertahan dalam moving-train assault yang dibaca melalui relative motion, enemy consist, dan parallel highway.

#### Facade dan sub-scenes

Active scene tetap `campaign-5`:

1. station;
2. departure cutscene;
3. journey;
4. finish/arrival cutscene.

Switch hanya lewat internal `enterSub`, dengan curtain 0.5 s. Checkpoint, stage stats, loadout, dan dialogue queue tidak reset.

#### Station state

```text
opening → clearDepot → hack → repair → board
```

- Safe room menahan semua garrison tetap idle.
- Membuka safe door membangunkan seluruh depot squad.
- Hancurkan central fabricator dan seluruh station robot.
- C1 menjalankan SIGNAL TRACE.
- Sukses membuka physical platform door.
- C2 menjalankan FIELD RESTART: PHASE SYNC lalu ROTOR KICKSTART.
- Board marker hanya commit setelah route siap.
- Setelah dialogue idle, tahan tambahan 3 s sebelum departure cutscene.

#### Station encounter

- Base depot 16 C/6 B/4 A = 26; multiplier 1.5 → 39.
- Central machine mencetak 3 robot per 10 s setelah charge 1.6 s.
- Class mix printed 67/22/11%.
- Machine harus hancur untuk clearDepot dan wreck tetap solid.

#### Train

- Real scale 4 m width = 28 units.
- Car length 16.5 m = 115.5 units.
- Player consist hanya one open-top combat car + locomotive.
- Player tidak dapat meninggalkan car.
- Interior lateral corridor sekitar ±8.1 units.
- Tidak ada crate solid di dalam train; supply berupa drops.
- Mainline memiliki dua track.

#### Departure cutscene

Lima locked-off shots:

`door moves/opens → Gibran boards → door closes → radio → train departs`

Player dan camera ride with car; station root tidak digeser.

#### Journey combat

- Enemy ten-car assault consist datang pada adjacent track dan dibuka/dihancurkan car-by-car.
- Robot di enemy train bersifat invulnerable sampai car mereka masuk encounter window.
- Setiap car berisi config-driven 3–6 B/A combatants.
- Highway merge mulai car index 4; Raven-style carriers membawa B/B/A permutations.
- Destroyed consist/wreck drift ke belakang dan keluar pool.
- Medkit cadence setiap dua cars/pickups.
- Locomotive assault memiliki local HP/attack controller, tetapi tidak menjadi universal boss-kind robot dan tidak mengubah rule “no boss entity” untuk stage.
- Arrival hanya dimulai setelah hostile route selesai dan minimum journey pacing terpenuhi.

#### Scenery

- Station city depot → West Java mountains.
- Near/mid/far pools bergerak berbeda.
- Ground surface selalu ada; background color tidak boleh terlihat sebagai terrain.
- Act changes hanya diterapkan offscreen/wrap, tidak pop di depan player.
- Combat leftovers bergeser bersama ground, bukan terbawa train.

#### Finish cutscene

Empat shot:

`locomotive front/braking → door opens → Gibran alights → close-up radio`

Kemudian Stage 5 Complete → shop → Stage 6.

#### Acceptance

- Active scene id tetap campaign-5 sepanjang seluruh sub-scene.
- Board delay baru menghitung setelah dialogue queue kosong.
- Player, robot, bullet, dan loot coordinates stabil saat scenery scroll.
- Train car tidak memiliki floating roof light atau overhead cage.
- Semua world coordinate reset tepat saat replay.

### 15.6 Stage 6 — False Homecoming

#### Tesis

Bandung tampak sebagai tujuan aman tetapi berubah menjadi dua-chapter gauntlet. Chapter pertama memulihkan akses ke HQ; chapter kedua membuktikan kill-switch valid namun membutuhkan root transmitter di IKN.

#### Facade

Active scene tetap `campaign-6`:

`Arrival terminal → HQ office`

Chapter world berjauhan melampaui camera far plane, memiliki root, nav, collider, dan light set sendiri. Handoff Arrival→HQ langsung tanpa cutscene/fade/dialogue baru.

#### Chapter 1 — Arrival

State:

```text
opening → stockUp → clearHall → findKey → powerGrid → exfil → complete
```

World 50×50:

- safe area `A/S`;
- supply room `W`;
- auto door `-`;
- key-locked auto door `=`;
- chapter door `@`;
- three key racks `K`;
- three 3×3 generators `G` + repair points `H`;
- finish `F`.

Flow:

1. Stock up; hall garrison frozen selama player di safe/supply.
2. Keluar hall membangunkan encounter `hall`.
3. Setelah clear, cari random physical key di salah satu tiga rack.
4. Key hanya unlock door; player tetap harus mendekat untuk membuka.
5. Enter power hall memunculkan `grid` garrison.
6. Repair tiga generator memakai advanced repair.
7. Exfil wave muncul; dua fabricator harus dihancurkan sebelum F aktif.
8. Exfil robots boleh dilewati.

Base encounter lalu multiplier 2:

| Encounter | Base C/B/A | Effective target |
| --- | --- | ---: |
| hall | 14/6/2 | 44 |
| grid | 6/4/2 | 24 |
| exfil | 5/3/2 | 20 |

Fabricator printing adalah rate dan tidak dikali.

#### Chapter 2 — HQ

State:

```text
office → upload → purge → escape → complete
```

World 50×50:

- `A` dan `Y` safe spawn zones;
- `S/F` start dan finish sama;
- `@` broken sealed routes;
- `+` hack-gated server door;
- `X` meeting-room SIGNAL TRACE terminal;
- `C` server bank;
- `H` physical upload point;
- `M` two hidden fabricator footprints;
- weapon cache, restroom, warehouse, open office.

Flow:

1. Office garrison idle selama player dalam combined safe area.
2. Server door menolak access dan marker pindah ke X terminal.
3. SIGNAL TRACE success membuka `+` door; timeout memunculkan alarm squad.
4. Standing di H memulai upload 5 s.
5. Upload berhenti tepat 92%: broadcast authority denied.
6. Lockdown dimulai; purge wave dapat spawn termasuk old safe area.
7. Dua machine naik dari `M`; sebelumnya visual/collider/cells benar-benar terbuka.
8. Hancurkan machine dan seluruh floor robot.
9. Return ke S/F untuk finish.

Base encounter lalu multiplier 2:

| Encounter | Base C/B/A | Effective target |
| --- | --- | ---: |
| office | 20/10/4 | 68 |
| signal alarm | 4/2/0 | 12 |
| purge | 11/6/3 | 40 |

#### Critical rules

- Tidak ada robot spawn di server room; chase masuk tetap boleh.
- HQ map, legend, machine points, dan safe checks harus sinkron.
- Machine bullet hit diproses sebelum solid `M` wall test.
- Open office desk banks meninggalkan aisle dua cells; row-34 mouth dan warehouse row 4 tidak boleh diblok.
- Restroom through-lane column 46 bebas blocker.
- Kedua computer marker tidak pernah menyala bersamaan.

#### Acceptance

- BFS player clearance mencapai semua objective dan door mouths.
- Chapter light set tidak menyala bersamaan.
- Hidden machine tidak punya collider; visible/wreck machine solid.
- Arrival key dipilih ulang per entry.
- HQ upload selalu gagal pada configured fraction dan tetap melanjutkan story.

### 15.7 Stage 7 — Pasupati Night Run

#### Tesis

Traversal 1.5 km di flyover malam yang diubah abandoned vehicles menjadi maze, ditekan mortar, lalu ditutup siege tiga fabricator di Pasteur dan acquisition GRD LTV-45.

#### State machine

```text
opening → flyover → tollApproach → factorySiege → vehicleReveal → outro → complete
```

#### World

- Flyover length 1500 m.
- 4 lanes per side, each 3 m; traversable 1 m median.
- Deck height 12 m; descent mulai meter 1200 sepanjang 200 m dan turun 12 m.
- Feeder ramps visual-only; player tetap di main deck.
- 14 actual PointLights; lamp lain emissive-only.
- Midnight lighting dan deep haze.
- Central Bandung procedural city di ground bawah flyover.
- Landmark cable tower tepat meter 700.
- World visual berlanjut 150 m melewati toll, tetapi walk/nav berhenti di gate.

#### Vehicle maze

- 16 gate bands × 9 vehicles + 96 scattered = 240 total.
- Sedan/SUV, container truck, dump truck, bus, tanker, open-bed pickup.
- Full oriented footprint dipakai collision, nav, LOS, dan placement overlap.
- Vehicle sendiri menjadi fadeable occluder node.
- Tidak ada pothole.
- Clearance BFS harus menemukan route yang lebih panjang daripada direct line dan melintasi median setidaknya sekali.

#### Encounter

| Zone | C/B/A | Total |
| --- | --- | ---: |
| eastSpan | 28/12/4 | 44 |
| rampRun | 31/14/5 | 50 |
| cableSpan | 29/14/5 | 48 |
| westSpan | 32/15/5 | 52 |
| pasteurApproach | 34/16/6 | 56 |
| **Total** | 154/71/25 | **250** |

Robot mengaktif saat masuk frustum, bukan hanya distance.

#### Mortar

- Aktif meter 500–1300.
- Satu shell setiap 6 s setelah initial delay.
- Impact point mengikuti player sampai lock window 0.5 s, lalu membeku.
- Damage player 30; robot 150.
- Dua pooled shells dan marker pairs.
- Leaving zone mereset cadence; airborne shell tetap mendarat.

#### Pasteur finale

- Tiga spawn machines.
- First batch 5 s; 3 robots per 5 s; class mix 50/35/15.
- Saat machine ketiga hancur, semua robot Stage 7 langsung collapse: on-screen melalui normal death, off-screen removed.
- Player menemukan GRD LTV-45, inspect, board, dan menerobos gate.

#### Density

- 90 loot boxes.
- 180 explosive barrels.
- Placement deterministic dan harus mengisi semua longitudinal bins.

#### Acceptance

- Slope ground height dipakai player, robot, drops, FX, corpse, dan projectile.
- City tidak menembus deck atau mengocclude dari camera side.
- 240 vehicle tidak menjadi satu route-wide batch.
- Player tidak dapat melewati toll meski continuation world terlihat.
- Menghancurkan third machine menyisakan zero live stage robot.

### 15.8 Stage 8 — Cisumdawu Kill Zone

#### Tesis

Mounted chase tanpa foot movement. Pemain berdiri di hatch GRD LTV-45, berpindah lane, menghancurkan carrier riders dan barrel haulers, lalu membaca duel gunship dengan tiga jawaban berbeda.

#### State machine

```text
opening → highway → groundPursuit → bossApproach → gunshipIntro
→ gunshipBattle → gunshipDeath → arrival → complete
```

#### Vehicle control

- Tujuh lateral slots: tiga lane tiap arah + median.
- Indonesia left-hand traffic: start di negative-Z carriageway.
- A/D edge pindah satu slot; hold tidak repeat; satu edge boleh buffer.
- Standard lane change 0.32 s; median transition 0.44 s.
- W/S, RMB, Shift, F tidak menggerakkan vehicle.
- Aim, shoot, weapon switch, dan medkit tetap aktif.
- Avatar legs disembunyikan dan torso tetap memakai normal recoil/aim.
- Camera ditarik 20% lebih jauh.

#### Scrolling world

- Player/vehicle/combat entity coordinates stabil.
- 20 road modules scroll dan wrap.
- Near/mid/far scenery pools punya parallax 1.0/0.62/0.34.
- Background transition Bandung city→West Java rice fields pada 65% carrier progress.
- Module hanya mengganti act saat offscreen; boss selalu di rice act.
- Airport adalah static separate set setelah fade.

#### Ground pursuit

- Spawn mulai setelah 4 s, gap 5.5 s, max 3 active.
- Target 20 destroyed carriers.
- Tiap Raven-K membawa tiga B/A sesuai 10 cyclic loadouts.
- Chassis tidak punya HP; kendaraan wreck hanya setelah ketiga rider mati.
- Setiap tiga carrier hancur memberi current-weapon ammo.
- Barrel hauler muncul setiap lima carrier: HP 300, enam barrel, telegraph/drop sequence, loot 55.

#### Gunship

- HP 9000; hit radius 25.
- Attack gap 1.5 s; di bawah 50% dikali 0.75.
- Opening attack selalu MG.
- Berikutnya memakai shuffle bag berisi MG/Cannon/Missile; setiap tiga attack memuat ketiganya dan tidak repeat lintas boundary.

Attack answers:

1. **MG corridor:** lane dikunci saat telegraph mulai; tinggalkan lane.
2. **Cannon lead:** target marker memprediksi lateral velocity selama telegraph; stop atau reverse untuk membuat prediction miss.
3. **Homing missiles:** tiga missile dapat ditembak atau di-lane-dodge.

Snapshot:

- MG telegraph 0.75 s, 16×5 damage.
- Cannon telegraph 1.1 s, 50 damage, radius 18, speed 125.
- Missile lock 1 s, burst 3, HP 40, hit radius 12, damage 45, speed 82.

Projectile harus lahir dari chin MG/cannon muzzle dan alternating left/right wing rail. Missile panjang/finned/red-banded dan destructible; cannon shell stubby/finless/amber band dan tidak destructible.

#### Boss escort below 50%

- Setelah first 4 s, satu endless barrel hauler + satu carrier B/B/A datang.
- Wave berikutnya baru spawn 3 s setelah kedua escort vehicle selesai, bukan timer buta.
- Hauler bed cycles cargo sehingga tidak terlihat kosong selamanya.
- Boss death meledakkan semua escort melalui normal death paths.

#### Acceptance

- Vehicle lane input frame-independent dan tidak repeat dari hold.
- No foot action bypass.
- Scenery act tidak pernah pop on-screen.
- MG tracer long axis sejajar velocity.
- Missile hitbox menutupi silhouette dan satu rifle hit dapat menghancurkannya dengan snapshot balance.
- Semua vehicle wreck shatter dari existing parts dan pulih tepat saat pool reuse.
- Road leftovers drift bersama road; loot sengaja tetap dekat player agar collectible.

### 15.9 Stage 9 — Kertajati Airlift

#### Tesis

Bandara adalah tiga large multi-zone chapters, bukan satu koridor singkat: frontage, terminal, dan runway. Pemain bertempur menuju transport, menyalakan physical fuel pump, lalu takeoff.

#### Facade dan chapter

Active scene tetap `campaign-9`:

`frontScene → interiorScene → runwayScene`

Switch hanya melalui `enterStage9Sub`; tidak memanggil global scene setter. Setiap chapter punya registered root, collision/nav space, dan light set sendiri pada origin yang terpisah melebihi far plane.

#### State machine

```text
opening → frontToll → frontForecourt
→ interiorCheckin → interiorConcourse
→ runwayApron → runwayAircraft
→ fuelPump → fueling → board → takeoff → complete
```

Gate membutuhkan encounter clear dan checkpoint/entrance reached.

#### Chapter 1 — Frontage

- Sekitar 1850×880 units.
- Four-lane toll, frontage boulevard, pedestrian bridge, bus shelters, two parking courts, forecourt.
- Minimal 500 semantic props dan 160 individual occluders.
- Large silhouette: canopies, service vans, lot fences, utility cabinets.
- Mid detail: cars, bus, booths, bridge, trolley bays, lamp masts, planters.
- Low detail: motorcycles, wheel stops, delineators, grates, benches, bins, luggage.
- 11 visible boundary runs tepat di walk edge, dibagi panel ≤90 units; visual fence, blocker, dan occluder transform sama.
- Terminal entrance tetap terbuka.
- Passenger cars menggunakan exact Stage 7 sedan/SUV specs; local +X adalah front dan menghadap divider.
- Semua lima tree crowns berada di dalam planter-local box.

Encounter:

| Zone | C/B/A | Total |
| --- | --- | ---: |
| frontToll | 22/8/3 | 33 |
| frontForecourt | 25/10/4 | 39 |
| **Chapter total** | 47/18/7 | **72** |

#### Chapter 2 — Interior

- Sekitar 700×1120 units.
- Check-in islands, queue rails, six security lanes, concourse, seating, baggage reclaim, service cages.
- Center spine + alternate flank routes.

Encounter:

| Zone | C/B/A | Total |
| --- | --- | ---: |
| interiorCheckin | 16/7/2 | 25 |
| interiorConcourse | 20/9/3 | 32 |
| **Chapter total** | 36/16/5 | **57** |

#### Chapter 3 — Runway

- Route >1000 units dari apron exit ke aircraft.
- Terminal fingers, service yard, crash-fire station, equipment cages, blast fence, taxiway, aircraft stand.
- Heavy transport terlihat sebelum player mencapai stand.

Encounter:

| Zone | C/B/A | Total |
| --- | --- | ---: |
| runwayApron | 10/5/1 | 16 |
| runwayAircraft | 12/6/2 | 20 |
| **Chapter total** | 22/11/3 | **36** |

#### Activation dan fuel

- Semua empat encounter Chapter 1–2 spawn idle.
- First body frame masuk camera frustum → chasing permanen; LOS tidak menunda.
- Physical fuel pump interaction range 14.
- Fuel duration 24 s, monotonic 0→100%.
- Setelah penuh, radar/objective berpindah ke aircraft.
- Approach boarding point memulai 8 s takeoff cinematic.
- Tidak ada hack, generator repair, flight core, spool, atau jet blast objective.

#### Acceptance

- Enam encounter tables tidak boleh digabung.
- Tidak ada setScene antar chapter.
- Root dan light set chapter nonaktif hidden.
- Seluruh perimeter Chapter 1 terlihat; tidak ada invisible outer wall.
- Fuel reset pada replay.
- Completion hook menuju Stage 10 hanya dipasang facade index.

### 15.10 Stage 10 — The Iron Port

#### Tesis

Industrial port assault. Pemain mengubah container layout secara fisik, mengambil relay access, lalu mematikan fixed defense cannon melalui tiga servo objectives sebelum naik freight carrier ke IKN.

#### State machine

```text
opening → yardEntry → craneMazeA → craneShift → warehouse
→ pipeRack → defenseArray → extract → departure → complete
```

#### World zones

1. Emergency freight apron.
2. Container yard A.
3. Crane safe bay.
4. Container yard B yang benar-benar berbeda.
5. Automated warehouse.
6. Pipe-rack corridor.
7. Defense pier dengan water edge.
8. Freight extraction yard.

Water selalu hard boundary dengan seawall/rail/dock face; player tidak dapat jatuh. Drop dan explosive endpoint dijepit ke deck valid.

#### Dynamic containers

- Tiga validated states: A, transition-safe, B.
- Player harus berada di safe bay sebelum motion.
- Input dapat dibekukan dengan bars selama 4 s move + 1 s settle.
- Robot tidak boleh berada di lane yang akan ditutup.
- Visual footprint dan blocker mengikuti transform setiap frame.
- Pathfinding menolak moving footprint tanpa rebake nav.
- Final transform harus exact; skip menerapkan final state yang sama.
- Carried container didaftarkan sebagai dynamic occluder.

#### Encounters

| Zone | C/B/A | Total |
| --- | --- | ---: |
| entry | 12/5/1 | 18 |
| yard | 16/7/2 | 25 |
| warehouse | 14/7/3 | 24 |
| pipeRack | 16/8/3 | 27 |
| defense | 18/8/3 | 29 |
| **Total** | 76/35/12 | **123** |

#### Defense array

Setpiece, bukan boss:

- cannon housing invulnerable;
- tiga servo/control boxes menjadi vulnerable dalam fixed order;
- masing-masing HP 550;
- cannon lock 1.2 s, fire delay 0.4 s, damage 55, radius 24, cooldown 2.4 s;
- firing lane membeku setelah lock.

Servo effect:

1. Traverse servo hancur → sweep authority berkurang.
2. Elevation servo hancur → blast aperture mengecil.
3. Fire-control relay hancur → cannon shut down dan extract gate open.

Tidak ada boss bar, boss loot, atau endless add.

#### Acceptance

- BFS lulus untuk layout A dan B.
- Moving container tidak dapat menekan player/robot di lane tanpa safe handling.
- Cannon tidak mengikuti player setelah lock.
- Semua supply/spawn blocker-clear.
- Extraction baru aktif setelah ketiga servo objective selesai dan required dialogue idle.

### 15.11 Stage 11 — The Green Firewall

#### Tesis

Pacing counterweight yang sunyi, basah, hijau, dan exposed. Scan bukan stealth fail; detection mengunci dead point artillery yang dapat dihindari atau dipancing ke robot.

#### State machine

```text
ambush → forestApproach → scanBelt → waterworks
→ finalSweep → tunnelEntry → complete
```

#### World zones

1. Carrier wreck clearing.
2. Forest service road dengan dua route options.
3. Canopy trail.
4. Sensor belt: clearing + shelters.
5. Waterworks approach.
6. Dam/service crest.
7. Control gallery resupply.
8. Final utility descent.

Tidak ada bridge destructible atau mandatory jump. Collapsed section hanya dressing di luar route.

#### Encounters

| Group | Wave | C/B/A | Total |
| --- | ---: | --- | ---: |
| forestApproach | 1 | 12/5/1 | 18 |
| forestApproach | 2 | 14/6/2 | 22 |
| sensorBasin | 1 | 15/7/2 | 24 |
| sensorBasin | 2 | 17/8/3 | 28 |
| waterworks | 1 | 16/8/3 | 27 |
| waterworks | 2 | 18/9/3 | 30 |
| **Total** | | 92/43/14 | **149** |

#### Scan system snapshot

- Cycle 14 s.
- Visible sweep 3 s.
- Required exposure to lock 1.2 s.
- Exposure decay 1.8 s.
- Incoming delay 1.4 s.
- Safe radius/derived visible band 115.

State:

`SCANNING → LOCKED dead point → INCOMING → IMPACT`

Rules:

- Roofed shelter atau designated dense infrastructure memutus exposure.
- Ordinary decorative canopy tidak otomatis memberi immunity.
- Leaving scan menurunkan exposure.
- Full lock menyimpan current player position dan tidak mengikuti lagi.
- Detection tidak reset progress.
- Dwell time visible band harus ≥ lock time pada config apapun yang diterima.

#### Artillery

- Pool 12.
- Damage player 42; robot 180; radius 22.
- Ground ring/countdown pulse jelas.
- Major concrete wall dapat memblok blast LOS.
- Dapat digunakan untuk membunuh robot.
- Tidak membuat PointLight baru; memakai shared explosion pool.

#### Acceptance

- Shelter immunity cocok dengan visible roof volume.
- Locked point byte-stable sampai impact.
- Scan state selalu muncul di HUD dan radar direction benar.
- Vegetation chunked/instanced, bukan satu forest-wide batch.
- Control gallery memberi guaranteed ammo + medkit.

### 15.12 Stage 12 — Nusantara Root

#### Tesis

Payoff objective Campaign: pemain mencapai root transmitter, memasukkan kill-switch secara fisik, menghancurkan guardian, dan benar-benar menonaktifkan network army.

#### Facade dan chapters

Active scene tetap `campaign-12`:

1. Surface/Civic Axis.
2. Root Transmitter.

Setiap chapter punya root dan light set sendiri; keduanya diprecompile.

#### State machine

```text
opening → axisAssault → rootApproach → descend
→ authorityGate → insertDrive → upload → wardenIntro
→ wardenBattle → broadcast → anomaly → complete
```

#### Surface

Zones:

- utility emergence;
- forest-city edge;
- administrative colonnade;
- ceremonial plaza;
- root access court.

Encounter:

| Group | Wave | C/B/A | Total |
| --- | ---: | --- | ---: |
| civicAxis | 1 | 18/8/3 | 29 |
| civicAxis | 2 | 20/9/3 | 32 |
| civicAxis | 3 | 22/10/4 | 36 |
| rootApproach | 1 | 16/8/3 | 27 |
| rootApproach | 2 | 18/9/4 | 31 |
| **Total** | | 94/44/17 | **155** |

Surface harus lebih pendek dari Stage 11 dan memberi full-current-weapon ammo opportunity + medkit sebelum drive insertion.

#### Upload

- Physical interaction, bukan puzzle.
- Upload monotonic dan tidak pernah turun.
- Pre-boss threshold snapshot 70%.
- Normal advance rate 5%/s.
- Jam phases mempause upload.
- Upload tidak boleh selesai sebelum Warden mati.
- Setelah death, final rate 8%/s sampai 100% selama closing beat.
- HUD menampilkan boss health dan upload/jam state bersamaan.

#### Nusantara Warden

State:

```text
dormant → reveal → arm → phase1 → jam1 → phase2 → jam2
→ phase3 → death → wreck
```

Baseline:

- HP 12000; score 2400;
- hit radius 32; body radius 28;
- move speed 19; turn 1.5 rad/s;
- phase thresholds 67% dan 34%;
- attack gap 1.8 s; enrage multiplier 0.8.

Phase 1:

- frontal 110° shield, damage multiplier 0.12;
- sweeping rail corridor;
- stomp circles;
- radial burst dengan gaps.

Jam 1:

- upload JAMMED;
- tiga capacitors × 900 HP;
- setiap destruction merusak cable/leg dan melemahkan shield.

Phase 2:

- lebih banyak shield opening;
- sector wedge attack dengan minimal satu safe lane;
- rail warning lebih pendek tetapi tetap ada;
- stomp delayed second ring.

Jam 2:

- dua root couplings × 1300 HP, vulnerable berurutan;
- body anchored dekat transmitter.

Phase 3:

- core terbuka dan menerima normal damage;
- attack set dipersempit, gap sedikit lebih pendek;
- telegraph tidak dipendekkan.

Attack snapshot:

| Attack | Telegraph | Damage | Detail |
| --- | ---: | ---: | --- |
| Rail | 0.9 s | 55 | width 16, speed 160, pool 4 |
| Stomp | 0.8 s | 45 | radius 42 |
| Burst | 0.7 s | 18 | 9 shot, gap 0.12, pool 18 |
| Sector | 1.1 s | 50 | radius 70, gap 55°, pool 6 |

Sector base angle dibekukan saat telegraph; tidak dihitung ulang saat detonation.

#### Ending beat

- Warden death membersihkan seluruh hazard.
- Upload mencapai 100%.
- Network army nationwide inert.
- Root mendeteksi satu air-gapped sovereign node.
- M-0 MAHAPATIH mengidentifikasi dirinya.
- Coordinate: Medan Merdeka, Jakarta.
- Green Stage 12 Complete → final Field Shop → Stage 13.

#### Acceptance

- Completion dipanggil melalui facade hook, bukan root chapter import Stage 13.
- Warden yaw berada pada group rotation, bukan position.
- Boss wreck memakai existing parts dan collision mengikuti settled pose.
- Jam target count/HP dari config.
- Radio panel ditutup di natural dan skip path.

### 15.13 Stage 13 — Zero Hour: Monas

#### Tesis

Kill-switch berhasil, tetapi mengungkap author hijack yang offline. Final stage kembali ke Jakarta dan menutup perjalanan di Monas melalui ordinary guard ring singkat dan boss tiga-form yang memadukan seluruh pelajaran telegraph Campaign.

#### State machine

```text
returnCine → silentApproach → blackGuard → vaultReveal
→ bossPhase1 → bossTransition → bossPhase2
→ zeroHour → finalCore → ending → complete
```

#### World

Stage 13 memiliki campaign-specific Medan Merdeka; jangan memutasi Survival world.

Zones:

1. Outer avenue deployment.
2. Silent vehicle corridor dengan inert network robots.
3. Park perimeter.
4. Tree-lined approach.
5. Ring road.
6. Monas plaza boss arena.
7. Empat hardline stations.
8. Legacy vault aperture di luar footprint Monas.

Monas solid dan bullet-blocking sesuai silhouette, tanpa HP bar. Boss path/charge tidak boleh menembus base.

#### Black Guard

Existing B/A/C dengan `offlineGuard` flag, bukan class baru. Mereka tetap memakai HP, weapon, loot, LOS, dan pathfinding normal.

Encounter:

| Formation | C/B/A | Total |
| --- | --- | ---: |
| deployment | 6/5/2 | 13 |
| park | 7/5/3 | 15 |
| plaza | 6/5/3 | 14 |
| **Total** | 19/15/8 | **42** |

Last guard memberi guaranteed ammo dan medkit.

#### M-0 Mahapatih baseline

HUD name:

`M-0 MAHAPATIH — SOVEREIGN WAR BODY`

Durability:

- siege frame 9000 HP;
- combat frame 7500 HP;
- final core 3200 HP;
- four anchors 950 HP masing-masing;
- score category 5000, tetapi no post-boss shop.

Global rules:

- semua attack sequential dan telegraphed;
- enrage memendekkan recovery, bukan telegraph;
- no ordinary adds selama boss;
- hazard phase lama dihapus saat transisi;
- collision cocok dengan visible body;
- arena lock dimulai saat masuk plaza dan berakhir untuk ending;
- Monas bukan damage sponge atau hidden timer.

#### Phase 1 — Sovereign Siege Frame

Movement quadruped pada outer ring, deliberate rotation, authored charge lanes.

Attack:

1. **Artillery fan:** tiga locked points, lock 1.1 s, incoming 1.3 s, damage 55, radius 24.
2. **Ring charge:** telegraph 0.9 s, speed 92, damage 60, knockback 36.
3. **Seismic front:** telegraph 1.0 s, dua arcs gap 0.45 s, damage 50, radius 48.
4. **Suppressive turret:** telegraph 0.7 s, 14 shot, 0.1 s interval, damage 14.

Zero siege HP:

- clear hazards;
- 4 s physical chassis rupture;
- central humanoid frame muncul;
- boss presentation jelas berganti/refill, bukan bar ambigu.

#### Phase 2 — Mahapatih Combat Frame

- speed 22; dash speed 75;
- tidak teleport;
- bounded dash dengan start/end eksplisit.

Attack:

1. Twin-blade cross: telegraph 0.7, second sweep gap 0.35, damage 55, radius 35.
2. Committed lunge: telegraph 0.75, speed 88, damage 65, width 18; arah membeku.
3. Blade waves: telegraph 0.8, speed 75, damage 40, radius 12, pool 12.
4. Shoulder cannon: telegraph 0.9, speed 130, damage 58, radius 20.

Boss tetap damageable. Jika guard mengurangi frontal damage saat blade attack, deflection feedback dan first-use HUD hint wajib ada.

#### Phase 3 — Zero Hour Hardline

- M-0 kembali ke center dan menyambung empat physical cables.
- Shield visibly fed oleh cable, bukan invulnerability misterius.
- Objective: destroy four anchors dalam urutan bebas.
- Setiap anchor menghilangkan satu shield quadrant dan satu hazard sector.
- Reduced Phase 2 attack subset tetap aktif.
- Rotating sweep: telegraph 1 s, 0.85 rad/s, damage 24, width 14.
- Countermand charge adalah presentasi, bukan hard fail timer.

Setelah semua anchor hancur:

- shield collapse;
- core shutters cycle open 3 s / closed 2 s;
- player merusak core 3200 HP;
- lethal hit membersihkan projectile, sweep, cable, dan contact damage dalam frame yang sama.

#### Ending

- Core light gagal bertahap.
- M-0 collapse menjauh dari Monas.
- Remaining offline guards shut down tanpa loot tambahan.
- Boss music resolve.
- Gibran, wreck, dan Monas masuk final frame.
- Night/storm residue berubah menuju sunrise selama 8 s.
- Final dialogue mengonfirmasi tidak ada hostile root authority lain.
- `CAMPAIGN COMPLETE` muncul setelah seluruh cinematic override dibersihkan.
- Return to Main Menu; checkpoint baru dibersihkan pada titik ini.

#### Acceptance

- Tiap boss phase dapat disimulasikan terpisah dalam test.
- Semua lock points frozen.
- Charge/lunge path tidak memotong Monas.
- Anchor count, health, dan sector disable dapat diaudit.
- Final screen tidak muncul sebelum epilogue.
- Tidak ada Field Shop setelah completion.

---

## 16. Boss dan setpiece — aturan bersama

### 16.1 Boss ownership

Tank, Gunship, Warden, dan Mahapatih bukan robot array biasa. Masing-masing memiliki:

- rig dan pooled projectiles;
- state machine;
- direct/swept bullet hit test;
- damage API;
- collision;
- death cleanup;
- reset/replay;
- warmup presentation;
- debug snapshot.

Jangan menskalakan class A menjadi boss. Robot subsystem mengasumsikan humanoid normal, loot/gore normal, dan AI normal.

### 16.2 Telegraph contract

Setiap boss attack harus memiliki urutan:

`select pattern → draw telegraph → lock/freeze relevant data → commit attack → recovery → clear`

Tidak boleh:

- mengubah target setelah lock;
- menggeser wedge/line saat detonation karena boss berputar;
- menumpuk attack baru sebelum attack lama selesai kecuali desain eksplisit;
- menghilangkan telegraph saat enrage;
- meninggalkan damage volume setelah phase/death.

### 16.3 Death contract

Pada lethal frame:

1. Damage state berubah satu kali.
2. Semua outgoing lethal hazard dibersihkan.
3. Music/SFX loop berpindah pada beat yang sesuai.
4. Existing rig parts menjadi wreck; tidak spawn duplicate high-detail wreck.
5. Collision hanya berubah mengikuti pose visual.
6. Player baru menerima narrative/cinematic control setelah tidak ada damage source.

### 16.4 Setpiece non-boss

Stage 10 defense cannon dan Stage 7 fabricator siege tidak memakai boss bar/score/music. Setpiece objective harus tetap punya readable parts, state, dan failure-free flow tanpa menyamar sebagai boss.

---

## 17. Minigame dan interaction language

### 17.1 Marker vocabulary

- **Amber square stand marker:** berdiri tepat di sini untuk menggunakan perangkat.
- **Ring marker:** pergi ke area/finish point.
- Hanya satu marker utama menyala pada satu waktu.
- Radar menunjuk target yang sama.
- Inactive future objective tidak berkedip menyaingi current target.

### 17.2 ICE BREACH

Digunakan Stage 1/3.

- Modal paused dengan pointer bebas.
- 5×5 circuit/path grid.
- Trace timer 60 s.
- Decoy chance 55%.
- Pemain menyusun/menyalakan route yang benar menuju target.
- Abort atau fail kembali ke objective state dan harus keluar range sebelum re-arm.
- Alarm horde dapat muncul pada failure sesuai context.
- Escape abort; gameplay keys ditelan.

### 17.3 SIGNAL TRACE

Digunakan Stage 5 C1 dan Stage 6 HQ X.

- Empat moving channels.
- Trace timer 40 s.
- Lock tolerance 0.075.
- Miss penalty 3 s.
- Cursor speed range 0.18–0.31.
- Player mengunci channel ketika cursor berada di target band.
- Timeout memunculkan alarm squad/cooldown sesuai stage.
- Tidak boleh diganti ICE BREACH atau progress bar.

### 17.4 FIELD REPAIR — early boards

Stage 2 menggunakan satu board per named component. Tiga komponen harus ditemukan lebih dahulu. Board count/difficulty berasal dari config; tidak ada countdown wajib.

### 17.5 FIELD RESTART — advanced repair

Stage 5 C2 dan tiga generator Stage 6 menggunakan tepat dua board:

1. **PHASE SYNC**
2. **ROTOR KICKSTART**

Abort mempertahankan completed-board index.

#### PHASE SYNC

- Oscilloscope menampilkan bus reference dan beberapa phase waves.
- Player menggeser trims sampai semua wave berhimpit menjadi satu line.
- Menggeser satu slider menarik slider lain sebesar coupling yang sama.
- Seluruh readout/lamp berasal dari satu `syncError`.
- Coupling harus dijepit di bawah diagonal dominance bound `(n−1)c < 1`, sehingga selalu solvable.
- Tidak ada hidden information atau puzzle text lookup.

Snapshot: coupling 0.16, tolerance 0.05, bus 50 Hz, span 6 Hz.

#### ROTOR KICKSTART

- 12 segments.
- Player memutar crank dengan benar untuk menaikkan RPM.
- Green zone 0.62–0.82.
- Mistimed ignition hanya mengurangi RPM, tidak reset seluruh repair.
- Reverse input mengurangi RPM sesuai config.

### 17.6 Interaction acceptance

- Modal pause tidak membuka pause blocker.
- Pointer unlock untuk modal tidak dianggap Escape pause.
- Resume kembali ke facade/sub-scene yang sama.
- Completed board index tidak hilang pada abort.
- Objective state tidak maju dua kali jika callback terpanggil ulang.

---

## 18. Level design, collision, doors, dan visibility

### 18.1 Walkability model

Tidak menggunakan full rigid-body physics. Sistem terdiri dari:

- walkable grid/union;
- per-axis slide untuk boundary;
- blocker rectangle/circle untuk furniture/props;
- standable-top height bila dibutuhkan;
- special dynamic blockers untuk doors, boss, vehicle, dan containers.

Collision resolve selalu hug-and-slide, tidak full revert.

### 18.2 Dua player radius

- Radius 5: wall, door, crates, barrels, outdoor boundary, robot reach reference.
- Radius 3.5: indoor furniture Stage 1–3 saja.
- Jangan menurunkan radius global untuk “memperbaiki” celah furniture.

### 18.3 Blocker spatial index

- Gunakan shared uniform-grid blocker index untuk static boxes.
- Query menyertakan margin largest half-edge.
- Candidate disortir kembali sesuai urutan blocker asli karena resolve dapat mengubah posisi secara berurutan.
- Jangan memakai `min(hx,hz)` sebagai query margin; itu menghasilkan divergence.
- Hasil indexed harus identik dengan full sweep pada random probe mutation tests.

### 18.4 Doors

Semua active campaign door adalah 50:50 split leaves yang bergerak simetris sepanjang wall.

Kontrak:

- Stage 1 menjadi reference behavior.
- Proximity zone 2.5 cells di depan door.
- Close linger 3 s.
- Motion exact-settle quadratic selama 0.45 s.
- Fully open leaf tetap 10% terlihat; travel 90% span.
- `open < 0.5` dianggap solid untuk collision.
- Bullet test memakai moving leaf footprints yang sama dengan visual.
- Enemy muzzle/body preflight dan normal sweep keduanya wajib.
- Accessible door jamb selalu green; locked/sealed/broken selalu red.
- SFX hanya melalui shared door helper, threshold crossing satu kali.

Broken door:

- pinned open fraction 0.14;
- tidak bergerak/berbunyi;
- solid terhadap player, robot, bullet;
- dapat dilepas hanya oleh explicit override seperti Stage 1 kill-switch.

### 18.5 Barricade dan breach

- `*` full-cell non-standable blocker, nav-baked, eight deterministic furniture recipes.
- `/` visual jagged jamb stubs, tanpa blocker.
- Token builder dibagi antarstage; jangan copy-paste implementasi.

### 18.6 Nav

- Furniture yang harus dihindari robot masuk blockers + nav.
- Barrel/crate player-only dan tidak masuk nav.
- Machine cells dapat tetap nav-blocked meski collider sementara hilang; nav tidak direbake mid-stage.
- Stable layout states selalu diuji BFS dengan actual player clearance.
- Door mouths, start, objective, supply, encounter spawn, dan finish harus reachable.

### 18.7 Bullet dan blast blocking

- `bulletBlocked` memutus bullet pada world geometry.
- `blastBlocked` menguji center explosion→target untuk closed door/major cover.
- Launcher impact dijepit di sisi penembak.
- Stage-specific bullet ordering harus memastikan damageable machine menerima hit sebelum generic solid footprint menghapus bullet.

### 18.8 Occlusion fade

Semua Campaign Stage 1–13 memakai satu sistem. Snapshot:

- target opacity 0.2;
- minimum cover fraction 0.5 body;
- fade rate 9;
- nearby robot sweep range 320;
- lateral pad 3;
- registry grid cell 48.

Rule:

- Prop fade hanya bila camera ray melalui footprint dan top menutup minimal setengah body.
- Player dan nearby robots sama-sama dapat menyebabkan fade.
- Material occluder diklon saat world build.
- Fadeable prop di-weld ke dirinya sendiri, bukan dimasukkan material batch besar.
- Moving occluder membaca transform ulang setiap frame.
- Low props yang hanya menutup kaki tetap opaque.
- Stage 8 sengaja tidak mendaftarkan occluder karena camera-side scenery selalu di bawah sight line.

### 18.9 Wall fade

Instanced wall cell tidak di-fade langsung. Cell disembunyikan dari instance matrix dan diganti pooled standalone proxy dengan cloned materials.

- Proxy pool dibuat saat world build.
- Wall skin detail juga instanced per face/material dan hilang bersama cell.
- Show kembali harus memanggil identity sebelum position; zero-scale matrix tidak boleh dipakai ulang mentah.
- Fixed draw groups per stage ≤17 untuk body+skin system.

### 18.10 Spawn safety

Setiap spawn/supply point diuji radius 0 terhadap blocker sendiri. Tambahan:

- tidak di wall cell;
- tidak di door mouth;
- tidak di safe/no-spawn zone;
- tidak di single-cell corridor untuk crate;
- reachable bila item/objective harus dipungut;
- offscreen bila kemunculan seharusnya tidak terlihat.

---

## 19. UI, HUD, radar, dan feedback

### 19.1 UI language

- Semua user-facing text English.
- Satu font: Courier Prime lokal.
- Visual language: field terminal, amber, warm white, gunmetal, restrained teal.
- Hindari pill buttons dan web-dashboard density.

### 19.2 Gameplay HUD

Elemen minimum:

- health bar + numeric HP;
- armor bar hanya saat armor worn;
- stamina bar;
- ammo module: weapon name, current ammo, max effective ammo;
- ordered weapon/medkit slots;
- objective/wave status;
- score/currency;
- radar bila dimiliki/diizinkan;
- contextual feed;
- boss HP dan special meter bila stage memerlukan.

### 19.3 Radar

- Screen-aligned, bukan north-up.
- Player center; radar-up sama dengan screen-up.
- True north marker dapat menunjuk arah dunia.
- Plot robot, loot, objective, dan special hazard sesuai scene.
- Far objective boleh dijepit ke edge.
- Tidak ada gradient background atau rotating sweep.
- Stage objective landmark harus sama dengan lit world marker.

### 19.4 Damage feedback

- Health flash, red blood, hit-direction wedge.
- Armor bar/visual plate mengomunikasikan durability.
- Robot tidak memperlihatkan health state.
- Boss boleh punya brief hit tint/impact spark untuk registrasi, bukan progressive color damage kecuali phase visual memang berubah.

### 19.5 Dialogue dan cinematic UI

- Bottom dialogue panel, immediate speaker, typed body.
- Radio distortion hanya untuk signal-loss context.
- Letterbox bars untuk cinematic control.
- Fade curtain menyembunyikan hard scene reset.
- SKIP button bottom-right: `SKIP ▸ [SPACE]`.
- Skip callback one-shot dan menghasilkan state akhir sama dengan natural path.

### 19.6 Finish/game-over

Green Campaign finish:

- `STAGE N COMPLETE`;
- Total Time;
- Loot Boxes Destroyed;
- continuation action.

Red defeat:

- restart stage/restart;
- exit main menu;
- tidak menampilkan per-stage green summary.

Final Campaign:

- `CAMPAIGN COMPLETE`;
- `RETURN TO MAIN MENU`;
- tanpa shop.

---

## 20. Art direction — GIBS 2045

### 20.1 Style statement

**Jakarta/Indonesia 2045, mildly futuristic, warm, dusty, civic-industrial, not cyberpunk.** Bentuk low-poly dibaca melalui silhouette dan broad material planes. Dunia masa depan masih merupakan Indonesia yang berevolusi, bukan kota neon abstrak.

### 20.2 Palette master

| Token | Hex | Fungsi |
| --- | --- | --- |
| ink | `#23262b` | trim tergelap |
| gunmetal | `#3a4046` | mesin/metal utama |
| steel | `#7c848c` | metal terang |
| panel | `#b8b2a6` | panel hangat |
| concrete | `#8a8378` | beton dusty |
| rubber | `#161618` | ban/seal |
| wood | `#6b4a29` | kayu hangat |
| leaf | `#3e6b2a` | vegetasi |
| tech | `#2fb8a6` | satu-satunya civic tech accent |
| techDim | `#0f3b36` | tech standby |
| screenBg | `#0d2320` | layar gelap |
| amber | `#ffb03b` | human/player/HUD |
| amberDim | `#8a5a14` | bara/status redup |
| hazard | `#b3402e` | red-white/hazard |
| white | `#d8d2c4` | warm white |

Forbidden:

- pure cyan `#00ffff`;
- pure magenta `#ff00ff`;
- neon underglow;
- pure black sebagai material dunia;
- cold blue-black sebagai base palette.

Environment emissive intensity maksimum 0.9; combat FX boleh melampaui.

### 20.3 Reserved gameplay colors

- robot eye red;
- bronze/silver/gold robot tier;
- coolant green;
- player blood red;
- enemy plasma blue;
- open/exit green.

Jangan memakai warna ini sebagai dekorasi ambigu.

### 20.4 Geometry language

- Low segment count pada cylinder/round forms.
- Large facets dan beveled planes.
- Matte Lambert-like environment.
- Metal hero asset boleh Phong secara terkendali.
- Detail mengikuti camera: roof/top surfaces, shoulder/back, large control face.
- Tidak ada micro-greeble padat atau texture PBR rumit.
- Hero assets boleh lebih detail jika di-weld dan hanya tampil pada setpiece.

### 20.5 Interiors

- Warm-grey bright facility panels.
- Matte Lambert floor tanpa normal/specular glare.
- Wall boleh memakai normal map panel depth.
- Faded teal seams/strips sebagai tech accent.
- Room PointLights selalu on.
- Exactly one wall cell antara adjacent rooms.

### 20.6 Environment storytelling

- Stage 4: Jakarta roadside lots dan alun-alun.
- Stage 5: depot, tracks, freight infrastructure, mountains.
- Stage 6: Bandung city ring, logistics arrival, open-plan HQ.
- Stage 7: Bandung districts below flyover, deep midnight.
- Stage 8: city thinning into Priangan rice terraces.
- Stage 9: airport frontage/terminal/apron melalui massing, bukan signage.
- Stage 10: container stacks, cranes, pipe racks, coastal water.
- Stage 11: broad faceted vegetation + concrete waterworks.
- Stage 12: forest-city civic axis + clean root facility.
- Stage 13: quiet Jakarta, inert army, landscaping, Monas silhouette.

### 20.7 Promotional art

Jika membuat cover/banner/store art, baca [`PROMOTIONAL-ART.md`](PROMOTIONAL-ART.md). Art harus menyerupai gameplay procedural low-poly: large facets, matte broad colors, sparse large clutter, tanpa glossy PBR/microdetail.

---

## 21. Animation, VFX, dan cinematic language

### 21.1 Animation principles

- Motion harus berasal dari pivot yang anatomis/mekanis.
- Gait cadence berasal dari actual movement speed.
- Feet/track/wheel direction harus cocok dengan axis model.
- Per-unit variation mencegah robotic synchronization yang tidak disengaja.
- Moving visual anchor dan logical muzzle/collider harus mengikuti transform yang sama.

### 21.2 Player gait

- Lower body mengikuti move direction.
- Upper body twist ke aim, clamp sekitar ±60°.
- Head turns first dan lebih cepat.
- Backpedal memakai reverse gait.
- Lateral movement memakai hip abduction dan weight shift.
- Idle feet planted sampai twist threshold memicu turn-in-place.

### 21.3 Robot gait

- Cadence mempertimbangkan class speed dan mass.
- Knee punya swing fold dan stance absorption.
- Ankle push-off/plant.
- Body turun pada support leg, tidak bob ke atas.
- Weight transfer lateral, torso lean, head stabilization.
- Turn menghasilkan bank.
- Footstep audio dipicu foot plant nearest active robot, bukan timer per robot.

### 21.4 Gunfire

- One damped recoil curve menggerakkan seluruh tubuh.
- Heavy shotgun/launcher memberi smoke dan ground puff.
- Rapid rifle membangun muzzle climb.
- Flash dan projectile benar-benar berasal dari muzzle.
- No FPS camera kick karena render camera terpisah; camera shake tetap boleh.

### 21.5 Hit-stop

- Satu global time-scale owner.
- Player melee sekitar 6% time selama ~75 ms.
- Robot claw sekitar 12% selama ~50 ms.
- Ease-out di tail, lalu tepat kembali 1.
- Slowdown baru menjadi faktor pada owner yang sama, bukan multiplier liar di render loop.

### 21.6 Pools

Fixed/warmed pool untuk:

- explosion lights;
- blood/coolant sprites;
- gibs;
- decals;
- boss projectiles/telegraphs;
- mortar shells/rings;
- vehicle road dust/sparks;
- repeated rain/ripple effects.

Runtime combat tidak membuat PointLight, shader material type, atau geometry baru.

### 21.7 Cutscene frame rate

- Saat `cinematicActive`, simulation tick dan render cap 24 FPS.
- Gameplay biasa tidak dibatasi oleh cap ini.
- Real-time cadence yang harus tetap nyata menggunakan `dtReal`/clock real.

---

## 22. Audio direction

### 22.1 Audio goals

- Weapon identity kuat dari satu shot.
- Threat telegraph memiliki bunyi sebelum damage.
- Mesin besar terasa berat melalui loop dan mechanical transient.
- Hutan, kota, port, airport, dan train memiliki ambience berbeda.
- Audio tidak spam seiring jumlah robot.

### 22.2 SFX rules

- Semua one-shot melalui pooled audio helper.
- Loop memakai dedicated node, tidak meminjam one-shot pool.
- Distance falloff untuk robot shot/door/heavy machinery.
- Satu nearest-robot footstep stream, bukan satu source per robot.
- Door open/close hanya dari shared helper dan threshold crossing.
- Train MP3 menggunakan gapless Web Audio loop dengan trimmed padding.
- Projectile incoming whistle berhenti tepat saat projectile detonate/clear.

### 22.3 Music contexts

1. **Menu:** mulai di main menu; fresh Campaign berlanjut melalui loading+prologue dan berhenti pada first live helicopter-intro frame.
2. **Battle:** random salah satu dua track; mulai pada first player bullet hit robot, bukan scene enter.
3. **Boss:** mulai ketika duel aktif, bukan selama pre-boss cutscene.

Battle music stop pada stage finish/shop transition, jump, game over, atau reset. Survival battle music boleh berlanjut antarwave dan shop.

### 22.4 Volume

- Music dan SFX slider absolute 0..1.
- Persist di local storage.
- Music update live saat slider digerakkan.
- Per-clip mix dipertahankan oleh scale, tidak diganti uniform loudness.

---

## 23. Difficulty dan balancing

### 23.1 Difficulty snapshot

| Difficulty | Robot HP | Robot damage | Spawn/recovery interval |
| --- | ---: | ---: | ---: |
| Easy | 0.75× | 0.5× | 1.3× |
| Normal | 1.0× | 1.0× | 1.0× |
| Hard | 1.4× | 2.0× | 0.8× |

Difficulty diterapkan dari immutable base config setiap kali, bukan mengalikan config yang sudah dimodifikasi.

### 23.2 Apa yang boleh diskalakan

- robot/boss durability;
- attack damage;
- Survival spawn interval;
- selected boss recovery gap.

### 23.3 Apa yang tidak boleh otomatis diskalakan

- telegraph duration;
- target lock semantics;
- projectile visual size;
- nav geometry;
- objective duration yang mengubah cerita;
- pickup readability;
- boss phase order.

### 23.4 Balancing heuristics

- C pressure ditangani positioning/melee/environment.
- B memaksa cover atau movement.
- A terbatas dan purposeful; tidak dipakai sebagai filler massal.
- Shotgun paling kuat terhadap clump karena pellet splash; harga/cadence harus mempertimbangkan ini.
- Medkit/guaranteed ammo ditempatkan sebelum setpiece panjang.
- Boss normal target: Warden 5–8 menit; Mahapatih 8–12 menit dengan upgraded loadout.
- Challenge ditambah melalui decision density dan pattern uncertainty yang bounded, bukan HP sponge semata.

---

## 24. Arsitektur implementasi referensi

### 24.1 Constraint teknologi

- Static site, tanpa bundler/framework/npm runtime dependency.
- ES modules.
- Three.js global dari CDN.
- Config JSON dimuat sebelum game start.
- Semua 3D model procedural dari primitive geometry.
- Harus dijalankan via HTTP server, bukan `file://`.

Rekonstruksi di engine lain boleh, tetapi contract state/data/performa tetap berlaku.

### 24.2 Layer ownership

```text
main / boot / frame loop
  ├─ core: state, scene manager, renderer, input, HUD, save, pause
  ├─ entities: player, weapons, bullets, robots, bosses, drops, FX
  ├─ scenes: survival dan campaign stage facades
  ├─ world: shared palette, lights, sky, facades, decor
  └─ utils: collision, pathfinding, batching, textures, audio, math
```

### 24.3 Scene interface

Minimum scene contract:

| Hook | Tujuan |
| --- | --- |
| `id` | unique scene identity |
| `enter(opts)` | ensure world, reset/place entities, camera/environment/checkpoint |
| `exit()` | optional cleanup |
| `updateMode(dt)` | stage/wave state machine |
| `updatePlayerControl(dt,step)` | override foot movement, mis. Stage 8 |
| `allowsPlayerAction(action)` | gate moveTarget/dodge/melee |
| `playerCollide` | player boundary/blockers/triggers |
| `groundHeight` | floor/elevation query |
| `bulletBlocked` | world bullet collision |
| `blastBlocked` | optional AoE LOS |
| `robotAI` | activation/pathing/target intent |
| `clampRobot` | post-separation validity |
| `clampDropPos` | valid item position + optional groundY |
| `awardKill` | score atau campaign loot |
| `hudStatus` | current objective text |
| `radarLandmarks` | objective/hazard plots |
| `camBounds` | optional arena camera lock |
| `checkWin` | optional win check |
| `shopKey/shopActive` | modal ownership |
| `skipRender` | opaque overlay optimization |

Shared system tidak boleh memiliki `if mode === campaign` untuk behavior baru; scene menyediakan hook.

### 24.4 State ownership

- Satu module memiliki state dan mengekspor live binding + setter/function.
- Consumer tidak menulis state owner langsung.
- Circular import hanya aman bila binding dibaca call-time, tidak module evaluation.
- Multi-chapter runtime memiliki state facade; chapter hanya adapter/controller.

### 24.5 Config discipline

- Semua mechanical tuning number di JSON.
- Baca config di dalam fungsi karena config belum loaded saat module evaluation.
- Visual-only amplitude/color/FOV boleh tetap di code.
- Satu behavior memiliki satu reader helper bila conversion/level/fallback penting.
- Test selalu membaca CFG, tidak hardcode tuned number.

### 24.6 Frame loop contract

High-level order:

```text
update aim
update gameplay:
  spawner / timers / player / weapon / projectiles / effects / drops
  barrels animate
  player bullets move
  barrel + crate + machine sweeps
  robots and enemy bullets
  deferred splash/explosions
  gore
  stage objective/win
follow render camera
animate avatar/decor
render or skipRender
```

Bullet harus bergerak sebelum robot sweep. Deferred kill queues mencegah splice array saat iterasi.

### 24.7 Time

- Motion dikali `step = dt × 60`.
- Countdown dikurangi `dt`.
- Fire cadence memakai real clock.
- Stage time dan death director memakai `dtReal` bila tidak boleh dipengaruhi slow motion.
- Satu global time scale menggabungkan hit-stop dan death slow motion.

---

## 25. Rendering dan performance budget

### 25.1 Quality tiers

| Tier | Pixel ratio | Shadow map | Bloom | Post |
| --- | ---: | ---: | --- | --- |
| Ultra | min(DPR,2) | 2048 | on | on |
| High | min(DPR,1.5) | 1024 | on | on |
| Medium | 1.0 | 1024 | off | FXAA/gamma |
| Low | 0.8 | 512 | off | off |
| Very Low | 0.6 | off | off | off |

Quality dipilih sebelum mission dan tidak berganti shader secara acak di combat.

### 25.2 No mid-game shader compile

Sebelum live frame:

- init fixed FX pools;
- build all campaign worlds;
- warm hero rigs dan projectile variants;
- prewarm hidden roots;
- compile setiap stage/chapter light set;
- render cutscene camera variants dan textures yang baru terlihat dari angle tertentu.

Runtime hanya boleh mengubah transform, visibility, existing material uniforms, dan pooled object state.

### 25.3 Batching rules

- Static opaque geometry → material batch.
- Static object yang harus fade → weld within itself + cloned material.
- Moving/toggle/color-changing objects → standalone.
- Transparent glass, LineSegments, PointLights, sprites, InstancedMeshes tidak boleh hilang dalam batch classifier.
- Shadow-aware batching memisahkan cast/receive flags agar satu caster tidak menyeret ribuan triangles ke shadow pass.
- Chunk world panjang secara spatial; jangan membuat satu route-wide bounding sphere.

### 25.4 Lighting

- Fixed PointLight count per active stage/chapter.
- Active light set memilih visibility; compile semua variants saat loading.
- Global FX lights tidak masuk stage registry.
- Outdoor guide/runway lights sebagian besar emissive-only.
- Large ground materials Lambert; Phong hanya bila visual benar-benar membutuhkan normal/specular.

### 25.5 Performance acceptance

- Inactive world root tidak di-traverse renderer/shadow pass.
- Collision indexed output identik dengan brute force.
- No runtime geometry/material/PointLight allocation pada spawn-machine wreck, vehicle wreck, boss death, atau loot claim.
- Fixed pool tidak overflow diam-diam; overflow harus recycle aman atau gagal terukur.
- Draw-call optimization diuji dengan measurement; jangan menambah chunking yang melipatgandakan calls tanpa bottleneck evidence.

---

## 26. Save, persistence, stats, dan cheats

### 26.1 Persisted values

- Campaign checkpoint key: integer 1–13.
- High score per difficulty.
- Music volume.
- SFX volume.
- Quality/settings sesuai implementasi menu.

Loadout, money, HP, ammo, dan within-stage progress tidak disimpan lintas browser session.

### 26.2 Save validation

- Gunakan strict Number + integer/range check.
- `12.5`, `12xyz`, 0, NaN, dan >13 invalid.
- Storage error tidak boleh crash game.

### 26.3 Cheat console

Developer commands yang harus didukung atau ekuivalen:

- `god-mode`;
- `more-money`;
- `skip-to-wave-N` Survival;
- `skip-to-stage-N` Campaign 1–13;
- `give-weapon-2/3/4` max level/full ammo;
- `give-armor-1/2/3` full durability.

Console hanya dapat dibuka saat pointer-locked active play, mempause game, dan ditutup saat Escape/unlock.

---

## 27. QA, smoke tests, dan acceptance matrix

### 27.1 Filosofi test

Smoke test harus memakai module game nyata dengan stub renderer/DOM/audio, bukan reimplementasi logic di test. Harness gap diperbaiki di harness, tidak diakali dalam game code.

### 27.2 Test kategori wajib

#### Boot dan config

- Config sections ada dan valid.
- Difficulty idempotent dari base copy.
- Semua user-facing source strings English.
- Tidak ada forbidden config keys yang menghidupkan mechanic dormant.

#### Player/combat

- Diagonal speed normalized.
- Screen basis benar untuk setiap camOffset.
- Dodge distance frame-rate independent dan i-frame meliputi seluruh attack types.
- Bullet sweep tidak tunnel.
- Cursor range clamp tetap dapat mengenai target tepat di endpoint.
- Splash skip direct victim dan blocked by door.
- Armor math dan shatter tepat.
- Medkit memakai effective max HP.

#### Robot

- C/B/A stats dari config.
- No-path berhenti, tidak straight fallback.
- Closed door memblok LOS dan bullet.
- Ranged muzzle preflight mencegah spawn-through-door.
- Separation tidak mendorong keluar walkable.
- Idle activation semantics per stage benar.

#### Economy/destructible

- Campaign kill drop loot; Survival direct score.
- Item di luar pickup radius tidak bergerak.
- Claimed item flight tidak mengubah claim timing.
- Crate selalu drop satu category berdasarkan weights.
- Crate count bertambah satu saja.
- Barrel chain reaction dan player damage benar.

#### Level

- BFS player clearance pada setiap stable layout.
- Door mouth, objective, start, finish reachable.
- Spawn/supply blocker clear.
- No furniture pada critical single route.
- Visible object/collider agreement.
- No double walls indoor.

#### Presentation/performance

- PAL-only dan forbidden neon absent.
- Environment emissive ≤0.9.
- Occluder fade 20% setelah half-body threshold.
- Wall proxy hide/show restores identity matrix.
- Fixed light counts.
- Inactive roots hidden.
- Runtime allocation guard untuk pools/wrecks.

#### Campaign state

- Setiap stage state machine dapat didorong ke semua branch.
- Natural dan skip path berakhir pada state sama.
- Stage 1–12 memakai finish→shop gateway.
- Stage 13 epilogue sebelum save clear/final screen.
- Stage stats exclude pause/loading/shop.

### 27.3 Mutation tests yang penting

Tes harus gagal bila sengaja dilakukan mutasi berikut:

- bullet update dipindah setelah robot hit sweep;
- door bullet clamp diganti whole-doorway blocker;
- obstacle index margin dipersempit;
- telegraph angle dihitung ulang saat detonation;
- Stage 11 scan band menjadi terlalu cepat untuk mencapai lock;
- machine collider tetap saat hidden;
- crate ditaruh di critical corridor;
- inactive world root dibuat visible;
- PointLight dibuat saat explosion atau vehicle wreck;
- M-0 final screen dipanggil sebelum ending.

### 27.4 Manual playtest checklist

- 30 FPS, 60 FPS, 144 FPS movement parity.
- 16:9 dan 21:9 tidak memperlihatkan world edge.
- Easy/Normal/Hard semua dapat menyelesaikan objective.
- Controller tidak menjadi target saat mouse-only spec—tidak perlu ditambahkan diam-diam.
- Spam pause/skip/abort tidak meninggalkan overlay atau cinematic flag.
- Death di setiap sub-scene restart ke stage start yang benar.
- Buy fourth weapon, undo, replace, restart, dan continue behavior.
- Door ditembak dari kedua sisi saat bergerak.
- Boss death ketika projectile sedang airborne.

---

## 28. Urutan produksi untuk membuat ulang

AI yang merekonstruksi sebaiknya mengikuti urutan ini. Jangan mulai dari 13 world sekaligus.

### Fase 0 — Vertical contract

1. Config loader dan immutable base.
2. Shared state owner.
3. Scene interface dan frame loop.
4. Logic pivot + render camera + virtual cursor.
5. Player movement/collision.
6. One weapon, one robot, swept bullet, damage/death.
7. Minimal HUD dan pause.

Exit criterion: satu arena kosong dapat dimainkan dengan pistol, C robot, dodge, melee, death, restart.

### Fase 1 — Combat completeness

1. Tiga robot classes.
2. Pathfinding, LOS, ranged fire, separation.
3. Empat weapons dan slot inventory.
4. Armor, medkit, stamina.
5. Gore, pooled FX, audio.
6. Loot/ammo/crates/barrels.

Exit criterion: combat sandbox memenuhi seluruh §8–11 acceptance.

### Fase 2 — Survival

1. Monas world/collision.
2. Wave machine dan aggro.
3. Shop/progression.
4. Monas fog dan collapse.
5. Intro cinematic.

Exit criterion: wave 1–10 dapat dijalankan, difficulty dan shop stable.

### Fase 3 — Campaign infrastructure

1. Checkpoint save.
2. Stage transition + Campaign shop.
3. Dialogue/typewriter/cutscene helpers.
4. Shared door, lift, marker, minigames.
5. Campaign robot AI, occlusion, world root/light registries.

### Fase 4 — Campaign arc 1

Build Stage 1→4 secara urut. Setiap stage harus complete dan smoke-green sebelum next stage.

### Fase 5 — Moving-world arc

Build Stage 5→8. Prioritaskan coordinate stability, pooled scenery, vehicle rigs, and projectile readability.

### Fase 6 — Campaign arc 2

Build Stage 9→13. Terapkan facade multi-chapter, large-world performance, sensor system, dan boss entities.

### Fase 7 — Acceptance/polish

- Full transition run Stage 1→13.
- Every skip/restart/death branch.
- Performance profiling per quality tier.
- Art/palette/source string sweeps.
- Promotional art dan documentation sync.

---

## 29. Data schema minimum

Rekonstruksi tidak harus memakai nama file sama, tetapi minimal membutuhkan namespace berikut:

```text
player
armor.tiers[]
stamina
dodge
movement
weapons.{shared,recoil,ammoUpgrades,weaponDefs}
melee
robot.{shared,score,classes}
survival.{waves,aggro,monas,fog,intro}
campaign.{shared,occlusion,dialogue,prologue,intro,doors,minigames}
campaign.stage1 ... campaign.stage13
campaign.bosses.{tank,gunship,warden,mahapatih}
drops
barrels
crates
shop
difficulty
dialogue.{campaign,survival}
```

### 29.1 Data rules

- Encounter count disimpan per class/zone.
- Dialogue disimpan per semantic key dan speaker.
- Boss attack memiliki telegraph, damage, geometry/hit radius, projectile/pool, recovery secara terpisah.
- Stage pacing tidak menduplikasi boss stat.
- Derived value dihitung helper, tidak disimpan dua kali.
- Arrays memiliki explicit order jika order berpengaruh pada state machine.

---

## 30. Anti-drift master checklist

Sebelum menyatakan versi baru sesuai GDD, jawab **YA** untuk seluruh item:

### Produk

- [ ] Judul tetap Decommission Day.
- [ ] Ada Campaign 13 stage dan endless Survival.
- [ ] Semua UI English.
- [ ] Game tetap top-down shooter, bukan FPS.

### Kontrol

- [ ] WASD screen-relative.
- [ ] Mouse virtual cursor untuk aim.
- [ ] LMB shoot, RMB move, Shift dodge, F melee, 4 medkit.
- [ ] Tidak ada reload/jump/crouch/sprint/ADS/thrown grenade.

### Combat

- [ ] Semua mode mulai pistol saja.
- [ ] Tiga normal robot classes bronze/silver/gold.
- [ ] Ranged LOS berbeda dari nav LOS.
- [ ] Bullet swept dan range berakhir di cursor.
- [ ] Bullet normal punya 1 m splash.
- [ ] Robot tidak punya visible damage state.
- [ ] Player blood merah, robot coolant hijau, vehicle oil hitam.

### World

- [ ] Collision mengikuti visual.
- [ ] Doors memakai shared split-leaf behavior.
- [ ] Barrels/crates player-only dan di luar nav.
- [ ] Furniture nav-baked.
- [ ] Occlusion satu sistem, 20%, half-body, walls included.
- [ ] Hanya campaign root aktif visible.
- [ ] Fixed light count/prewarm tetap.

### Campaign

- [ ] Prologue DOM black/typewriter/ASCII art.
- [ ] Intro tiga scene helicopter current canon.
- [ ] Stage 5/6/9/12 facade tidak diganti scene antar chapter.
- [ ] Stage 9 tetap tiga large zones dan enam encounters.
- [ ] Stage 12 kill-switch benar-benar berhasil.
- [ ] Stage 13 adalah final closure tanpa hidden sequel node.
- [ ] Stage 1–12 finish→shop; Stage 13 no shop.

### Presentation

- [ ] GIBS 2045 warm-dusty, teal tunggal, amber human accent.
- [ ] Tidak ada cyan/magenta neon atau micro-greeble density.
- [ ] Menu minimalis satu kolom kiri di blurred skyline.
- [ ] Radar tanpa sweep/gradient; crosshair hidden.
- [ ] Semua dialogue box typewriter.

### Quality

- [ ] Smoke suite hijau.
- [ ] Syntax/type checks hijau.
- [ ] BFS setiap stable layout hijau.
- [ ] Natural/skip state parity hijau.
- [ ] No runtime shader/PointLight allocation pada combat paths.

---

## 31. Glossary

| Istilah | Definisi |
| --- | --- |
| Active scene | facade yang dipanggil shared engine saat ini |
| Chapter/sub-scene | controller internal stage tanpa mengganti active scene |
| Logic pivot | objek camera lama yang menyimpan posisi mata dan yaw aim player |
| View camera | camera perspektif yang benar-benar merender |
| CAMP_M | 7 world units per meter |
| Blocker | footprint collision static/dynamic |
| Walkable | area valid untuk center entity setelah radius clearance |
| Nav | grid/path graph robot |
| LOS | line of sight; dapat berbeda untuk body walk dan bullet |
| Swept test | collision sepanjang segment posisi lama→baru |
| Telegraph | visual/audio warning sebelum attack commit |
| Lock/dead point | target/pattern yang dibekukan sebelum damage |
| Root | parent group seluruh world satu stage/chapter |
| Light set | kumpulan PointLights fixed untuk stage/chapter |
| Weld | menggabungkan meshes di dalam satu object sambil mempertahankan transform object |
| Batch | menggabungkan banyak static objects berdasarkan material/flags |
| Pool | sekumpulan object prebuilt yang didaur ulang |
| Item looting | klaim money/ammo/medkit pada satu pickup radius |
| Wreck | destroyed pose yang memakai bagian rig existing |
| Facade | satu scene identity yang mempertahankan checkpoint/stats di atas beberapa chapter |

---

## 32. Definition of done final

Sebuah remake **Decommission Day** bukan selesai hanya karena semua level dapat dibuka. Ia selesai ketika:

- pemain dapat memahami ancaman dari silhouette, motion, telegraph, audio, HUD, dan environment tanpa dokumentasi eksternal;
- setiap objective mempunyai state transition yang deterministik dan dapat dipulihkan pada restart;
- 13 stage terasa berbeda tetapi tetap memainkan satu combat language;
- ending Stage 12 terasa sebagai kemenangan nyata dan Stage 13 sebagai konsekuensi terakhir, bukan pembatalan kemenangan;
- Survival dapat meningkat tanpa batas tanpa merusak wave accounting atau Monas behavior;
- performa tetap stabil karena world visibility, batching, spatial query, light ownership, dan warmup dirancang sejak awal;
- seluruh invariant pada checklist §30 dibuktikan oleh automation dan manual playtest.

Dokumen detail pendamping tetap berguna untuk implementasi spesifik, tetapi GDD ini adalah gambaran produk utuh yang harus dipertahankan saat game dibuat ulang.
