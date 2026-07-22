# SECOND-IMPROVEMENT-PLAN

Ide-ide untuk membuat **Campaign** lebih seru — bergaya _Alien Shooter_ dan game sejenisnya.
Fokus: fitur yang **nyambung dengan sistem yang sudah ada** (bukan tempelan), diurutkan dari dampak-tertinggi.

> Catatan: ini brainstorm/backlog, belum diimplementasi. Baca [CLAUDE.md](CLAUDE.md) + [MODULES.md](MODULES.md) sebelum mengerjakan salah satu item. Update tabel status di bawah saat selesai.

---

## Prioritas 1 — Paling nendang (dampak besar, sistem sudah ada)

### 1. Loot & currency drop dari robot yang mati
Ciri candu Alien Shooter: tiap musuh mati muntah koin/loot yang tersedot ke player.
- Kalian sudah punya sistem `drops` + gore (`killRobot`).
- Tambah drop **scrap/credit** (nyambung ke score-as-currency yang dipakai shop).
- Robot pecah → serpihan chip berkilau → **magnet ke player** saat dekat.
- Efek dopamin instan; mendorong pemain agresif masuk kerumunan, bukan kiting.

### 2. Barrel / objek meledak di environment
- Tong bahan bakar / tabung teal di stage indoor yang bisa ditembak → ledakan AoE.
- Reuse `queueBoom` / `explodeAt` — nyaris gratis secara sistem.
- Cocok di gudang Stage 2 dan pabrik Stage 3. Taktis + memuaskan.

### 3. Swarm moment — "the horde"
- Momen skrip: pintu terbuka, **puluhan robot lemah** (kelas C, HP kecil) membanjir sekaligus.
- Sudah ada spawn machine (Stage 3) + door-gated waves sebagai fondasi.
- Contoh: "SEMUA pintu terbuka, bertahan 30 detik" — panik seru, bukan grind.

### 4. Senjata signature yang "kotor"
- Genre ini dikenang karena minigun & flamethrower yang menyapu layar.
- Sudah ada Gatling Lv3 (visual).
- Usulan: **Flamethrower** (cone DoT, reuse partikel) — pasangan sempurna untuk swarm (#3).

---

## Prioritas 2 — Menambah kedalaman

### 5. Variasi objektif per stage
Biar tak selalu "bunuh semua + capai pintu":
- **Bertahan:** lindungi objek selama timer (pinjam pola Monas dari Survival).
- **Escort/rescue:** bawa NPC dari titik A ke B.
- **Sabotase timer:** pasang peledak lalu **lari** sebelum meledak (chase sequence).

### 6. Environmental hazard aktif
- Lantai listrik, kebocoran uap, konveyor pabrik yang mendorong.
- Stage 3 (pabrik robot) = tempat sempurna. Memberi arena "kepribadian".

### 7. Deployable / turret sekali pakai
- Beli di shop, taruh di lantai, nembak otomatis sebentar.
- Memuaskan untuk momen hold-the-line.

### 8. Enemy special abilities
Biar robot tak cuma beda HP:
- Robot **peledak** (lari bunuh diri — exploder lama yang dihapus bisa balik sebagai kelas).
- Robot **perisai** yang melindungi yang lain.
- Robot **cepat/pelompat** yang memaksa player terus bergerak.

---

## Prioritas 3 — Perekat pengalaman

### 9. Progression antar-stage yang terasa
- Combo / kill-streak counter dengan bonus score.
- Atau "no-damage bonus". Menambah skill ceiling.

### 10. Mini-boss di tiap stage
- Bukan cuma tank di Stage 4.
- Stage 3 (pabrik) teriak minta boss — prototipe robot raksasa dari mesin fabrikasi.

---

## Rekomendasi urutan pengerjaan

Kerjakan dulu **#1 (loot drop) + #2 (barrel meledak) + #3 (swarm moment)**:
- Ketiganya pakai sistem yang **sudah ada** (`drops`, `queueBoom`, door-gated waves).
- Efek "seru"-nya paling langsung terasa.
- Risiko regresi kecil.

---

## Status

| # | Fitur | Prioritas | Status |
|---|-------|-----------|--------|
| 1 | Loot & currency drop | 1 | Belum |
| 2 | Barrel meledak | 1 | Belum |
| 3 | Swarm moment / horde | 1 | Belum |
| 4 | Senjata signature (Flamethrower) | 1 | Belum |
| 5 | Variasi objektif per stage | 2 | Belum |
| 6 | Environmental hazard aktif | 2 | Belum |
| 7 | Deployable / turret | 2 | Belum |
| 8 | Enemy special abilities | 2 | Belum |
| 9 | Combo / kill-streak progression | 3 | Belum |
| 10 | Mini-boss per stage | 3 | Belum |
