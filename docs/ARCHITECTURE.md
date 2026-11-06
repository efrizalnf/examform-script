# Arsitektur & panduan pengembangan

## Lapisan

```
Web UI (HtmlService)   Android (HTTP POST)
        │ google.script.run        │ doPost
        └─────────────┬────────────┘
                 ApiRouter        ← satu dispatcher, cek peran per rute
                 controllers      ← peta "aksi" → service (tanpa logika bisnis)
                 services         ← aturan bisnis, otorisasi data (AccessPolicy)
        question-types (Strategy) │ SheetRepository (generik)
                 core (Errors, Validate, Crypto, Clock, ...)
                 Google Sheets / Script Properties / CacheService
```

- **Container** (`infra/Container.js`) satu-satunya tempat merakit objek (dependency injection). Service menerima repository lewat konstruktor → mudah diuji dengan mock.
- **Schema** (`infra/Schema.js`) mendefinisikan semua sheet. Tambah kolom di akhir → header ditambahkan otomatis saat sheet dibuka.
- **Tanpa urutan muat**: file hanya mendefinisikan fungsi/kelas/literal; dependensi diselesaikan saat dipanggil, jadi urutan file Apps Script tidak berpengaruh.

## Google Form (mode gform)

```
soal (bank, tipe apa pun) ──FormPlanService.build──► rencana item ──FormGateway.deploy──► Google Form
                                                                      (NIS, Nama, lalu soal)
respons Form ──FormGateway.readResponses──► FormPlanService.readAnswers ──► jawaban CBT ──GradingService.compute──► Sesi.nilai
```
- **Tipe soal menyumbang pemetaannya sendiri** (`toFormItems` / `fromFormAnswers`), jadi menambah tipe baru otomatis mendukung Form.
- `FormPlanService` murni (tanpa FormApp) → mudah diuji; `FormGateway` satu-satunya yang memanggil `FormApp` (dapat diganti Forms REST API).
- Form **bukan mode kuis**: tidak ada kunci/poin di Form. Nilai dihitung server dari bank soal → bobot desimal, isian multi-kunci, dan jodoh parsial tetap konsisten dengan mode native.
- `Soal.formItems` menyimpan `{sub: itemIdForm}`; `Ujian.formStale` menandai bank soal ≠ isi Form.
- `FormResultService.sync` inkremental (lewati `formResponseId` yang sama), satu respons per NIS (paling awal), penanda `terlambat`, satu `updateMany` untuk semua sesi.
- Sesi mode gform dibuat saat `start` (timer & token tetap di server); status `selesai` diset klien (`finish`) atau trigger saat batas lewat.

## Cara menambah…

**Tipe soal baru** (mis. benar/salah): buat `question-types/BenarSalahType.js` dengan `{type, manual, normalize, buildLayout, present, grade, toFormItems, fromFormAnswers}`, tambahkan ke `QuestionTypeRegistry.all()`. Router, grading, UI siswa API otomatis ikut. (UI guru: tambah builder di `web/js/SoalEditor.html`.)

**Endpoint baru**: tambah metode di service → tambah satu entri `{roles, handle}` di controller yang cocok.

**Entitas/sheet baru**: tambah di `Schema`, daftarkan `repo.*` di `Container`, buat service.

**Penyimpanan lain (mis. Firestore/BigQuery)**: implementasikan antarmuka yang sama dengan `SheetRepository` (`findAll/findById/findBy/insert/update/upsert/delete/deleteWhere/updateMany`) dan ganti di `Container`.

## Keputusan desain penting

| Topik | Keputusan | Alasan |
|-------|-----------|--------|
| Sesi login | Token HMAC stateless | Tidak perlu tabel sesi; cepat |
| Sesi ujian | 1 baris per (ujian, siswa), id deterministik `ujianId:nis` | Cegah ganda; `start` idempotent (resume) |
| Jawaban | Upsert per (sesi, soal) | Baris terbatas, tanpa lock di jalur panas |
| Acak | Urutan soal/opsi disimpan di `Sesi.layout` | Tampilan konsisten saat resume; penilaian memakai ID asli |
| Timer | `batas` dihitung & disimpan server saat start | Jam perangkat tidak dipercaya |
| Auto-selesai | Trigger 5 menit + penutupan malas saat diakses | Siswa yang menutup aplikasi tetap dinilai |
| Nilai | `GradingService.gradeSession` idempotent | Dipakai ulang setelah guru menilai essay |
| Format sel | Semua kolom teks (`@`) | NIS ber-nol-depan & ID tidak diubah Sheets |
| Pencarian | `TextFinder` per kolom | Tidak memuat seluruh tabel besar (Sesi/Jawaban) |

## Skala & kinerja

- Jalur panas (simpan jawaban) = 1 pencarian + 1 tulis per soal. Klien sebaiknya batch bila offline.
- Tabel kecil (Users, Siswa, Mapel, Ujian) dibaca penuh per permintaan; jika Siswa > ±5.000 baris, tambahkan cache `CacheService` pada `findAll` di repository.
- `deleteWhere` menulis ulang sheet; hanya dipakai pada operasi admin/guru, bukan jalur siswa.
- Pertimbangkan `LockService` bila menambah operasi baca-ubah-tulis yang dapat bertabrakan antar pengguna.
