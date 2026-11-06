# ExamForm CBT

Backend & web admin **Computer Based Test** di atas Google Apps Script + Google Sheets (V8).
Admin & guru memakai Web App (`/exec`), siswa memakai aplikasi Android terpisah yang memanggil API JSON dari script yang sama.

> Riwayat perubahan: lihat [CHANGELOG.md](CHANGELOG.md). Setiap perubahan kode wajib dicatat di sana.

## Fitur

| Peran | Fitur |
|-------|-------|
| **Admin** | Kelola guru (mapel, jenis ujian, waktu ujian lewat *Penugasan*) · kelola siswa (NIS, nama, kelas, jenjang, impor massal, **generate password** per siswa/kelas/semua) · master mapel & jenis ujian · **setara guru untuk ujian**: buat ujian/soal/peserta, **Deploy ke Google Form**, aktif/nonaktifkan ujian & soal, generate **token**, sinkron & koreksi hasil |
| **Guru** | Buat soal (5 tipe) · atur **waktu ujian** & jadwal buka/tutup · atur **peserta** · aktifkan mapel · **Deploy ke Google Form** · **aktif/nonaktifkan ujian sendiri** · generate **token** · sinkron hasil & nilai essay |
| **Siswa (Android/Flutter)** | Login NIS+password · dashboard hanya ujian **aktif** yang mereka ikuti · mulai dengan **token** · soal dikerjakan di **Google Form (WebView)** dengan NIS & nama terisi otomatis · **timer dihitung server** · nilai tampil setelah guru menyinkronkan hasil |

Tipe soal: pilihan ganda, multi opsi, isian singkat, essay (nilai manual), menjodohkan. Di Google Form: pilihan ganda → pilihan, multi → kotak centang, isian → jawaban singkat, essay → paragraf, menjodohkan → satu dropdown per baris kiri. **Kunci jawaban tidak pernah masuk ke Form**; penilaian dilakukan di server.

## Struktur

```
src/
├── appsscript.json            manifest (V8, scope minimal)
├── Main.js                    doGet / doPost / apiRequest (hanya delegasi)
├── Setup.js                   setup() sekali jalan, trigger, reset admin
├── config/Constants.js        konstanta & enum
├── core/                      Errors, Validator, Crypto, Clock, Ids, Lock, Logger, Shuffle
├── infra/                     Schema, SheetRepository, SpreadsheetProvider, FormGateway (FormApp), Container (DI)
├── question-types/            1 file per tipe soal + QuestionTypeRegistry  (Strategy)
├── services/                  logika bisnis (Auth, User, Siswa, Penugasan, Ujian, Soal, Peserta,
│                              StudentExam, Grading, Result, FormPlan, FormDeploy, FormResult, ...)
├── api/                       ApiRouter + controllers/ (peta aksi -> service, cek peran)
├── jobs/Jobs.js               handler trigger waktu
└── web/                       UI Admin/Guru (HtmlService): Index, Styles, js/*.html
docs/                          API.md, ARCHITECTURE.md, INTEGRASI-FLUTTER.md (alur Google Form), INTEGRASI-FLUTTER-NATIVE.md
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

> **Memperbarui dari versi 1.0.x:** scope baru `…/auth/forms` harus disetujui — jalankan fungsi apa saja (mis. `setup`) dari editor sekali dan setujui izin, **baru** buat versi deployment baru. Kolom baru di sheet ditambahkan otomatis.

## Alur kerja

```
Admin: guru + mapel + jenis ujian + waktu (Penugasan), siswa
Guru atau Admin: buat ujian → tambah soal → atur peserta → "Deploy ke Form" → aktifkan ujian → bagikan token
Siswa: login → daftar ujian aktif → input token → WebView Google Form (NIS/nama terisi) → kirim
Guru atau Admin: "Sinkronkan hasil" → nilai otomatis; nilai essay manual → nilai akhir dihitung ulang
```
Ujian tampil ke siswa bila: ujian **aktif** ∧ mapel/penugasan **aktif** ∧ siswa **peserta** ∧ belum lewat jadwal tutup ∧ form **tidak usang**
(soal berubah setelah deploy → *Deploy ulang* dulu). Mengaktifkan/menonaktifkan ujian otomatis membuka/menutup Form; trigger 5 menit menutup Form yang jadwalnya lewat.
Ujian yang belum di-deploy tetap bisa dipakai klien *native* (`mode: "native"`, lihat `docs/API.md`).

**Perhatian Google Forms:** form harus dapat diisi tanpa login Google (Workspace dapat membatasi lewat kebijakan domain — uji di jendela incognito);
bobot dihitung server sehingga desimal didukung; `acakOpsi` tidak diterapkan di Form; jangan mengedit isi Form secara manual (ubah soal di aplikasi lalu *Deploy ulang*);
Form tidak bisa dipaksa kirim saat waktu habis — respons yang lewat batas ditandai **Terlambat** saat sinkron.

## Pengujian

```bash
node tests/run.js        # 46 tes backend end-to-end (mock SpreadsheetApp/Cache/Lock/Utilities)
node tests/gform.js      # 38 tes alur Google Form (mock FormApp): deploy, token, sinkron, nilai
npm test                 # keduanya
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
- Soal tidak dapat diubah/dihapus setelah ada siswa yang mengerjakan (menjaga integritas nilai); begitu pula deploy ulang Form.
- Pembuatan Form lewat `FormApp` (±0,3–0,5 dtk/soal) dan sinkron ratusan respons dapat memakan waktu puluhan detik; batas 6 menit/eksekusi.
- Tes memakai mock `FormApp`; perilaku Google Forms nyata (mis. acak per bagian, kebijakan Workspace) perlu diuji sekali pada akun Anda.
