# Rencana: Konversi ke Desktop Windows (.exe) & Publikasi ke Steam

> Dokumen rencana untuk mengubah **Gibran vs Zombie 3D** (game browser statis,
> lihat [CLAUDE.md](CLAUDE.md)) menjadi aplikasi desktop Windows yang bisa dijual di
> **Steam** (dan itch.io versi desktop), tanpa menulis ulang game.
>
> Status: **rencana/belum dieksekusi.** Dibuat 2026-07-04. Perbarui bagian "Status
> eksekusi" di bawah saat langkah dikerjakan.
>
> **Catatan sinkronisasi (2026-07-05):** kode sudah direfactor dari satu `index.html`
> menjadi ES modules di `src/` + `css/` + `config/gameplay.json` (katalog: MODULES.md),
> dan `package.json` metadata (`"type": "module"`) kini SUDAH ada — Electron init
> tinggal menambah field `main`/dependensi, jangan menimpanya. Rencana ini tetap
> berlaku; penyebutan "seluruh game di index.html" di bawah adalah kondisi lama.
> Perhatian ekstra utk Fase 1: game kini dimuat via ES modules + `fetch` config, jadi
> jendela Electron perlu `loadFile` yang mendukung module/fetch (Electron modern OK)
> atau server statis internal — uji ini bersamaan dgn vendoring CDN.

---

## 0. TL;DR / keputusan yang sudah diambil

- **Bisa dilakukan.** Game web dibungkus shell native jadi `.exe`; kode game (Three.js,
  `index.html`, `assets/`) tetap sama.
- **Wadah terpilih: Electron** (paling teruji untuk Three.js + Steam). Alternatif: NW.js
  (setara) atau Tauri (jauh lebih kecil, tapi perlu diuji di WebView2).
- **Perubahan kode wajib: hanya 1** — bundle semua library CDN ke lokal (game Steam
  harus jalan **offline**). Sisanya (SFX, `localStorage`) sudah jalan apa adanya.
- **Hambatan terbesar bukan teknis, tapi administratif**: biaya **Steam Direct US$100
  per app** + paperwork (pajak/bank/identitas) + App ID — **hanya user yang bisa
  melakukannya**, bukan Claude.
- **Bonus wadah native**: seluruh hack anti-shortcut browser (fullscreen + Keyboard Lock
  + `beforeunload`) jadi tak perlu — di Electron tak ada tab/address bar, Ctrl+W dll
  tidak melakukan apa-apa.

---

## 1. Analisis kelayakan

Game ini kandidat ideal untuk dibungkus:
- **Satu file** [index.html](index.html) (inline CSS + DOM + seluruh `<script>`), tanpa
  build system/framework. Wadah tinggal memuat 1 halaman.
- Aset lokal minimal: `assets/sounds/*.mp3`. (`assets/visuals/zombie.glb` tidak dipakai.)
- Render pakai WebGL + Three.js → di Electron memakai Chromium yang **sama** dengan
  Chrome, jadi WebGL/PointerLock/bloom/post-processing berperilaku identik. Tidak ada
  risiko "beda browser".
- Persistensi via `localStorage` (`gibsHighScore`, `gibsQuality`) → tetap bekerja di
  Electron (punya penyimpanan per-app).

Satu-satunya ketergantungan yang tidak boleh dibawa ke desktop: **CDN**. Lihat §3.

---

## 2. Arsitektur target (Electron)

```
the-gibs-game/
├─ index.html                 # game (tetap; hanya <head> script src diubah ke lokal)
├─ assets/sounds/*.mp3        # tetap
├─ vendor/                    # BARU: library yang sebelumnya dari CDN (lihat §3)
│   ├─ three.min.js           # three r128
│   ├─ CopyShader.js
│   ├─ LuminosityHighPassShader.js
│   ├─ GammaCorrectionShader.js
│   ├─ FXAAShader.js
│   ├─ EffectComposer.js
│   ├─ RenderPass.js
│   ├─ ShaderPass.js
│   └─ UnrealBloomPass.js
├─ desktop/                   # BARU: kode shell Electron (dipisah agar web build bersih)
│   ├─ main.js                # proses utama Electron: buat BrowserWindow fullscreen
│   ├─ preload.js             # (opsional) jembatan Steamworks -> renderer
│   └─ steam/                 # (fase 2) integrasi steamworks.js + steam_appid.txt
├─ build/                     # ikon (.ico), aset installer
├─ package.json               # BARU: deps electron + electron-builder + skrip build
└─ (SteamPipe VDF -> lihat §7, boleh di folder terpisah `steampipe/`)
```

Prinsip: **jangan mengotori build web.** `index.html` harus tetap jalan dibuka langsung
di browser (untuk itch web). Wadah desktop hanya me-*load* file yang sama. Selama
referensi library relatif (`vendor/...`), keduanya jalan.

---

## 3. Perubahan kode WAJIB: bundle CDN → lokal

Saat ini `<head>` [index.html](index.html) memuat 9 skrip dari CDN. Semua harus diunduh
ke `vendor/` dan referensinya diubah jadi relatif. Daftar persis (versi harus tetap
**three r128 / 0.128.0** — game dikalibrasi untuk API r128):

| Dari CDN | Simpan ke |
|---|---|
| `cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` | `vendor/three.min.js` |
| `cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js` | `vendor/CopyShader.js` |
| `…/examples/js/shaders/LuminosityHighPassShader.js` | `vendor/LuminosityHighPassShader.js` |
| `…/examples/js/shaders/GammaCorrectionShader.js` | `vendor/GammaCorrectionShader.js` |
| `…/examples/js/shaders/FXAAShader.js` | `vendor/FXAAShader.js` |
| `…/examples/js/postprocessing/EffectComposer.js` | `vendor/EffectComposer.js` |
| `…/examples/js/postprocessing/RenderPass.js` | `vendor/RenderPass.js` |
| `…/examples/js/postprocessing/ShaderPass.js` | `vendor/ShaderPass.js` |
| `…/examples/js/postprocessing/UnrealBloomPass.js` | `vendor/UnrealBloomPass.js` |

Lalu di `<head>`, ganti setiap `src="https://…"` menjadi `src="vendor/…"` (urutan tetap:
three dulu, lalu CopyShader/Luminosity/Gamma/FXAA, lalu EffectComposer/RenderPass/
ShaderPass/UnrealBloomPass — dependensi post-processing bergantung urutan ini).

**Uji**: buka `index.html` tanpa koneksi internet (atau DevTools → offline). Kalau bloom
& FXAA masih jalan (bukan fallback `renderer.render` polos), berarti bundle sukses.
Fallback aman sudah ada: bila salah satu skrip gagal, `composer` tetap `null` → render
langsung (lihat CLAUDE.md "Post-processing").

> Catatan: menyimpan salinan three.js r128 (lisensi MIT) di repo diperbolehkan. Sertakan
> berkas lisensi three.js di `vendor/LICENSE` agar rapi untuk distribusi.

---

## 4. Langkah implementasi teknis (dikerjakan Claude)

### Fase 1 — Desktop build yang jalan offline (tak perlu akun Steam)
Bisa dikerjakan sekarang; hasilnya langsung diuji & bisa dijual di itch.io desktop.

1. **Bundle CDN → `vendor/`** dan ubah `<head>` (lihat §3).
2. **`package.json`**: tambah `electron` + `electron-builder` (devDependencies), skrip
   `start` (`electron desktop/main.js`) dan `dist` (`electron-builder --win`).
3. **`desktop/main.js`**: buat `BrowserWindow` — fullscreen/borderless, `webPreferences`
   aman (`contextIsolation: true`, `nodeIntegration: false`), muat `index.html` via
   `loadFile`. Matikan menu bar. Tangani `Ctrl+Q`/close dengan benar. Set
   `backgroundColor` gelap agar tak ada flash putih saat start.
4. **Ikon**: `build/icon.ico` (256×256 minimal). electron-builder memakainya untuk exe.
5. **electron-builder config** (di `package.json` `build`):
   - `appId`, `productName: "Gibran vs Zombie 3D"`.
   - `win.target`: untuk Steam pakai output folder terpaket (`dir`) → Steam yang urus
     "install"/update lewat depot. Untuk itch bisa tambahan `nsis` (installer) atau zip.
   - `files`: sertakan `index.html`, `assets/**`, `vendor/**`, `desktop/**`.
6. **Hasil**: `dist/win-unpacked/` (folder aplikasi + `*.exe`). Uji jalan **tanpa
   internet**, cek performa/FPS, PointerLock, audio, fullscreen, quality tiers.
7. **Rapikan hack browser** (opsional): di Electron, kode fullscreen + `navigator.
   keyboard.lock` + `beforeunload` jadi mubazir. Boleh dibiarkan (tak berbahaya) atau
   digating `if (!window.__ELECTRON__)`. Jangan sampai `beforeunload` menghalangi quit.

### Fase 2 — Integrasi Steamworks (perlu App ID dari user)
1. Tambah **`steamworks.js`** (rekomendasi; modern, prebuilt) — hindari `greenworks`
   (butuh rebuild native yang ribet).
2. **`steam_appid.txt`** (berisi App ID) untuk mode dev; di produksi Steam menyuntik ID.
3. Inisialisasi Steam di `desktop/main.js`, ekspos ke renderer via `preload.js`
   (contextBridge) untuk memicu **achievement**.
4. **Achievement**: definisikan dulu di Steamworks partner site, lalu panggil
   `activateAchievement('ID')` di momen game (mis. "Bertahan Wave 10", "Selesaikan
   Campaign", "100 Headshot"). Perlu id skor dari `score`/`wave.num`/kill headshot.
5. **Steam Overlay**: aktif otomatis via SDK di Electron (butuh flag GPU tertentu;
   uji Shift+Tab). **Cloud save**: map `localStorage` high score ke Steam Cloud
   (opsional; bisa via Auto-Cloud file atau API).
6. Sertakan **redistributable Steamworks SDK** (`steam_api64.dll`) di paket.

---

## 5. Yang HARUS disiapkan USER (Claude tak punya akses)

1. **Akun Steamworks + Steam Direct US$100/app** (recoupable setelah US$1.000 penjualan
   kotor). Butuh: verifikasi identitas, **formulir pajak** (WNI: W-8BEN), **rekening
   bank**. Prosesnya bisa **beberapa minggu**.
2. **App ID** dari Valve (muncul setelah #1) → berikan ke Claude untuk Fase 2.
3. **Aset halaman toko**: capsule images (beberapa ukuran: header 460×215, small
   231×87, main 616×353, library 600×900, dsb.), min. 5 screenshot, idealnya trailer,
   deskripsi, tag, genre, rating usia. (Claude bisa bantu draft teks & placeholder.)
4. **Timeline Valve**: halaman toko "Coming Soon" harus tayang **±2 minggu** sebelum
   rilis + ada review build oleh Valve (beberapa hari). Rencanakan jeda ini.
5. **Upload final** lewat kredensial Steam user (Claude siapkan skrip SteamPipe, user
   yang menjalankan/menekan tombol).
6. **(Opsional) Sertifikat code-signing** (~US$100–400/th) agar Windows SmartScreen tak
   memunculkan peringatan "Unknown Publisher". Tidak wajib untuk Steam, tapi disarankan.

---

## 6. Distribusi ganda: Steam + itch.io

Satu basis kode, dua target — **jangan buang build web**:
- **itch.io (web)**: zip `index.html` + `assets/` + `vendor/` → "HTML5 game, play in
  browser". (Setelah §3, versi web pun tak lagi butuh CDN → lebih tahan.)
- **itch.io (desktop)** & **Steam**: folder Electron terpaket dari Fase 1.
- Perbedaan Steam: tambah integrasi Steamworks (Fase 2) + upload via SteamPipe.

---

## 7. Build & upload ke Steam (SteamPipe)

Setelah punya App ID + Depot ID (dari partner site):
- Buat 2 file VDF:
  - `steampipe/app_build_<AppID>.vdf` — definisi build, arahkan ke depot.
  - `steampipe/depot_build_<DepotID>.vdf` — `ContentRoot` = `dist/win-unpacked/`,
    `FileMapping` rekursif `*` → depot.
- Upload: `steamcmd +login <user> +run_app_build …/app_build_<AppID>.vdf +quit`.
- Set default branch / rilis di partner site.

Claude bisa **menghasilkan file VDF & skrip**; **login/upload pakai kredensial user**.

---

## 8. Risiko & catatan penting

- **Ukuran build**: Electron ~150–250 MB terpasang. Normal untuk Steam; sebutkan di
  system requirements. (Tauri ~5–15 MB kalau mau ramping — tapi WebView2 perlu diuji
  untuk post-processing & Keyboard behavior.)
- **Offline wajib**: setelah §3 tak ada ketergantungan jaringan. Jangan menambah CDN
  baru di masa depan tanpa membundelnya.
- **Audio autoplay**: batasan autoplay browser tak berlaku/di-relax di Electron → SFX
  lebih andal. Tetap uji.
- **Performa**: sama seperti Chrome. Quality tiers (Penuh…Sangat Rendah) tetap relevan
  sebagai setting dalam game; pertimbangkan menjadikannya opsi menu desktop juga.
- **Versi three.js dikunci r128** — jangan "upgrade" saat bundling; banyak kalibrasi
  (UV transform via `material.map`, dll.) bergantung perilaku r128 (lihat CLAUDE.md).
- **GPU/driver**: sebagian mesin lama butuh flag Electron (`disable-gpu-sandbox` dsb.)
  untuk WebGL/overlay Steam. Uji di beberapa mesin.
- **Kill switch beforeunload**: pastikan tidak menghalangi window close di Electron.
- **Nama proses/window** harus cocok dengan yang didaftarkan di Steam (untuk overlay).

---

## 9. Checklist urutan eksekusi

**Fase 1 (Claude, sekarang — tak butuh Steam):**
- [ ] Unduh 9 library CDN → `vendor/`, ubah `<head>` jadi path relatif (§3)
- [ ] Uji `index.html` offline (bloom/FXAA masih aktif)
- [ ] `package.json` + `desktop/main.js` + ikon (§4 Fase 1)
- [ ] `electron-builder` → hasilkan `dist/win-unpacked/` + uji offline/FPS/PointerLock/audio
- [ ] (Opsional) rapikan hack browser via flag `__ELECTRON__`
- [ ] Paket web itch (zip index+assets+vendor) — bonus, langsung bisa rilis

**User (paralel):**
- [ ] Daftar Steamworks + bayar Steam Direct US$100 + paperwork pajak/bank
- [ ] Dapatkan **App ID** → serahkan ke Claude
- [ ] Siapkan aset & teks halaman toko (Claude bantu draft)
- [ ] Tayangkan "Coming Soon" ≥2 minggu sebelum rilis

**Fase 2 (Claude, setelah App ID ada):**
- [ ] Integrasi `steamworks.js` + `steam_appid.txt` + `preload.js`
- [ ] Definisikan & pasang achievement (Steamworks site + panggilan di game)
- [ ] (Opsional) Steam Cloud untuk high score, uji overlay
- [ ] Buat VDF SteamPipe + skrip upload

**User (rilis):**
- [ ] Jalankan `steamcmd` upload (kredensial user)
- [ ] Atur build ke branch default, ajukan review, set tanggal rilis

---

## 10. Referensi

- Steamworks: <https://partner.steamgames.com/> (Steam Direct, App ID, SteamPipe)
- Electron: <https://www.electronjs.org/> · electron-builder: <https://www.electron.build/>
- Steam SDK di Electron: `steamworks.js` <https://github.com/ceifa/steamworks.js>
- three.js r128 (lisensi MIT) — untuk `vendor/`
- Konteks arsitektur game: [CLAUDE.md](CLAUDE.md)

---

## Status eksekusi

_(Perbarui saat mulai mengerjakan.)_

- Fase 1: **belum dimulai**
- Fase 2: **belum dimulai** (menunggu App ID)
