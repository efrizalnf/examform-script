# ExamForm CBT

Backend & web admin **Computer Based Test** di atas Google Apps Script + Google Sheets (V8).
Admin & guru memakai Web App (`/exec`), siswa memakai aplikasi Android terpisah yang memanggil API JSON dari script yang sama.

## Fitur

| Peran | Fitur |
|-------|-------|
| **Admin** | Kelola guru (mapel, jenis ujian, waktu ujian lewat *Penugasan*) · kelola siswa (NIS, nama, kelas, jenjang, impor massal, **generate password** per siswa/kelas/semua) · aktif/nonaktifkan **ujian** & **soal** · generate **token** ujian · master mapel & jenis ujian |
| **Guru** | Buat soal (5 tipe) · atur **waktu ujian** & jadwal buka/tutup · atur **peserta** (siswa yang berhak) · aktif/nonaktifkan **mapel** untuk dijadwalkan · generate token · lihat hasil & nilai essay |
| **Siswa (API/Android)** | Login NIS+password · dashboard hanya ujian **aktif** yang mereka ikuti · mulai ujian dengan **token** · soal & opsi **diacak** · jawaban tersimpan per soal · **timer dihitung server** · selesai otomatis saat waktu habis |

Tipe soal: pilihan ganda, multi opsi, isian singkat, essay (nilai manual), menjodohkan.

## Struktur

```
src/
├── appsscript.json            manifest (V8, scope minimal)
├── Main.js                    doGet / doPost / apiRequest (hanya delegasi)
├── Setup.js                   setup() sekali jalan, trigger, reset admin
├── config/Constants.js        konstanta & enum
├── core/                      Errors, Validator, Crypto, Clock, Ids, Lock, Logger, Shuffle
├── infra/                     Schema (definisi sheet), SheetRepository, SpreadsheetProvider, Container (DI)
├── question-types/            1 file per tipe soal + QuestionTypeRegistry  (Strategy)
├── services/                  logika bisnis (Auth, User, Siswa, Penugasan, Ujian, Soal, Peserta,
│                              StudentExam, Grading, Result, ...)
├── api/                       ApiRouter + controllers/ (peta aksi -> service, cek peran)
├── jobs/Jobs.js               handler trigger waktu
└── web/                       UI Admin/Guru (HtmlService): Index, Styles, js/*.html
docs/                          API.md, ARCHITECTURE.md
tests/                         tes end-to-end dengan mock Apps Script (Node) + smoke test UI
```

Aliran dependensi searah: `api → services → infra/core`. Controller tidak berisi logika bisnis;
service tidak tahu soal HTTP/HTML; repository tidak tahu soal aturan bisnis.

## Pemasangan

1. Buat **Google Spreadsheet** baru → *Extensions → Apps Script* (script terikat ke spreadsheet itu).
2. Dengan [clasp](https://github.com/google/clasp):
   ```bash
   npm i -g @google/clasp && clasp login
   cp .clasp.json.example .clasp.json   # isi scriptId dari Project Settings
   clasp push
   ```
   (Alternatif: salin isi `src/` manual; nama file HTML harus `web/Index`, `web/Styles`, `web/js/Core`, dst.)
3. Di editor Apps Script jalankan fungsi **`setup`** → setujui izin. Lihat *Execution log*: akan tercetak
   `username: admin | password: ...`. Setup membuat semua sheet, rahasia penanda token, data awal jenis ujian,
   dan trigger 5-menit penutup sesi. Aman dijalankan ulang.
4. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*.
   URL `/exec` dipakai untuk web admin/guru (buka di browser) **dan** sebagai base URL API Android.
5. Login admin → tambah mapel/jenis ujian → tambah guru → *Penugasan* → impor siswa → guru membuat soal & peserta → admin aktifkan ujian.

Setelah mengubah kode: `clasp push` lalu **Deploy → Manage deployments → Edit → New version**.

## Alur kerja

```
Admin: guru + mapel + jenis ujian + waktu (Penugasan), siswa
Guru : aktifkan mapel → buat ujian (durasi/jadwal) → tambah soal → pilih peserta
Admin: aktifkan ujian (butuh ≥1 soal aktif)         ← token dibagikan pengawas
Siswa: login → daftar ujian aktif → masukkan token → kerjakan → selesai
Guru : lihat hasil, nilai essay → nilai akhir dihitung ulang
```
Ujian tampil ke siswa bila: ujian **aktif** (admin) ∧ mapel/penugasan **aktif** (guru) ∧ siswa **peserta** ∧ belum lewat jadwal tutup.

## Pengujian

```bash
node tests/run.js        # 46 tes backend end-to-end (mock SpreadsheetApp/Cache/Lock/Utilities)
node tests/ui-smoke.js   # smoke test UI di Chromium (butuh `npm i playwright`)
```

## Keamanan — ringkas

- Kunci jawaban & rubrik **tidak pernah** dikirim ke API siswa (lihat tes "kunci TIDAK bocor").
- Password: HMAC-SHA256 + salt per akun + *pepper* di Script Properties (bukan di sheet). Password asli hanya tampil sekali saat generate.
- Token sesi bertanda tangan HMAC dengan masa berlaku (admin/guru 8 jam, siswa 6 jam). Pembatasan percobaan login (5x / 5 menit).
- Timer, batas waktu, jadwal, dan kepemilikan data diverifikasi di server; klien tidak dipercaya.
- Spreadsheet database **jangan dibagikan** ke guru/siswa — seluruh akses lewat aplikasi.

## Batasan yang perlu diketahui

- Kuota Apps Script (±30 eksekusi bersamaan, 6 menit/eksekusi): cocok untuk ratusan siswa serentak; untuk ribuan pertimbangkan memecah jadwal per kelas.
- Menonaktifkan akun tidak langsung memutus token yang sudah terbit (masa berlaku terbatas).
- Soal tidak dapat diubah/dihapus setelah ada siswa yang mengerjakan (menjaga integritas nilai).
