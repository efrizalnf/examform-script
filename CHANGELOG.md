# Changelog

Semua perubahan pada ExamForm CBT dicatat di sini (format [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), versi mengikuti [SemVer](https://semver.org/lang/id/)).
Repo: https://github.com/efrizalnf/examform-script

## [Unreleased]

## [1.4.1] - 2026-11-09
### Diperbaiki
- **Refresh halaman tidak lagi kembali ke login**: pada Web App Apps Script yang berjalan di iframe ber-sandbox, `sessionStorage` tidak bertahan. Sesi kini juga disimpan di hash URL halaman induk (`google.script.history.replace`) dan dibaca lagi saat dibuka (`google.script.url.getLocation`); hash tidak dikirim ke server, token tetap berlaku maksimal 8 jam dan dihapus saat *Keluar*. Smoke test mensimulasikan hilangnya sessionStorage.
- **Filter hasil ujian per kelas kini selalu tampil** dan mencakup seluruh peserta: peserta yang belum membuka ujian ikut ditampilkan dengan status *belum mulai* (sebelumnya hanya siswa yang sudah punya sesi, sehingga filter kosong/tidak terlihat).
### Ditambahkan
- **Jenjang baku** SD/MI, SMP/MTs, SMA/MA (`Jenjang` di Constants): siswa wajib memakai salah satunya (input seperti SD, mi, smp, MTS, sma, ma, SMK otomatis dibakukan; selain itu ditolak). Form siswa memakai pilihan jenjang, daftar siswa/peserta/hasil punya filter jenjang, impor massal ikut dibakukan, `meta.options` mengembalikan daftar jenjang. Data lama (mis. "SMA") tampil sebagai SMA/MA dan terbakukan saat disimpan ulang.
- Popup **Email** khusus di menu Guru (klik email atau tombol *Email*) untuk mengubah email guru tanpa membuka form lengkap; email tetap ada juga di form Ubah.

## [1.4.0] - 2026-11-08
### Ditambahkan
- **Filter hasil ujian per kelas** (menu Hasil): pilihan kelas beserta jumlah siswa, ringkasan Siswa/Selesai/Rata-rata/Tertinggi/Terendah ikut menyesuaikan filter.
- **Bank soal**: `BankSoalService` + tabel `BankSoal` (dibuat otomatis lewat `setup`). Rute `bank.list` (filter mapel/tipe/cari), `bank.saveFromUjian` (semua soal atau sebagian; duplikat dilewati lewat sidik jari tipe+teks), `bank.import` (salin soal bank ke ujian lain; diblokir bila ujian sudah dikerjakan; Form perlu deploy ulang) dan `bank.remove`. Guru hanya melihat bank miliknya, admin melihat semua. UI: menu **Bank Soal**, tombol *Simpan semua ke bank soal*, *Ke bank* per soal, dan *Ambil dari bank soal* di halaman Soal.
- **Hak edit Google Form hanya untuk email guru terdaftar**: kolom baru `Users.email` (diisi admin di menu Guru; divalidasi, huruf kecil, unik). Saat Deploy, `FormGateway.syncEditors` menjadikan email guru pemilik ujian sebagai editor Form dan **mencabut editor lain**. Rute `ujian.syncEditors` (tombol *Atur akses edit*) menerapkan ulang setelah email diubah. Hasil dilaporkan jelas: `ok` / `tanpa_email` / `gagal` (mis. bukan akun Google) tanpa menggagalkan deploy. UI ujian menampilkan tautan **Edit Form** + email editor.
- **Beranda** untuk admin & guru (`dashboard.stats`): kartu ringkasan (siswa, guru, ujian, sedang mengerjakan, soal, status Form) dan daftar ujian terbaru.
### Diubah
- **Tampilan lebih profesional**: sidebar gelap bergradasi dengan ikon & kartu pengguna, banner sapaan, kartu statistik, tabel lebih lega, tombol/badge/field bergaya baru, mode gelap dan responsif ponsel; daftar ujian dipadatkan (kolom Jadwal, Soal/Peserta, Token/Kode keluar digabung).
- Tes: `tests/v14.js` (27 uji) ditambahkan ke `npm test`; UI smoke test diperluas (Beranda, bank soal, Edit Form, filter kelas).
### Catatan peningkatan
- Jalankan `setup` sekali (menambah kolom `email` dan sheet `BankSoal`), lalu `clasp push` dan buat **versi deployment baru**. Isi email guru di menu Guru, lalu klik *Atur akses edit* pada ujian yang sudah di-deploy.

## [1.3.0] - 2026-11-06
### Dipercepat
- **Sinkron hasil Google Form jauh lebih cepat**: inkremental (hanya respons baru sejak `Ujian.formSyncedAt`; kolom baru otomatis), satu tulis ke sheet, kiriman ganda lintas-sinkron tidak menimpa respons yang sudah dipakai. Tombol baru *Sinkron ulang penuh* (`hasil.syncForm` dengan `penuh: true`) untuk membaca ulang semua respons. Trigger 5 menit kini ikut menyinkronkan ujian aktif ber-Form (`FormResultService.syncActive`) sehingga klik manual hampir tanpa pekerjaan.
- **Web app lebih cepat dibuka**: (1) cache lintas-eksekusi (`CacheService`) untuk tabel kecil — Users, Siswa, Mapel, JenisUjian, Penugasan, Ujian — dengan versi yang dinaikkan setiap ada tulisan (TTL 5 menit bila Spreadsheet diedit manual); (2) `ujian.list` tidak lagi memuat seluruh tabel Soal (hanya kolom yang dihitung, `SheetRepository.pluck`); soal per ujian dibaca lewat pencarian, bukan memuat seluruh tabel; (3) HTML UI hasil evaluasi template di-cache (kunci memuat versi aplikasi); (4) prefetch paralel data layar pertama (daftar ujian, penugasan) segera setelah login.
- Mock `CacheService` mendukung `getAll`/`putAll`; tes cache lintas-eksekusi dan `ChunkCache`.

### Diperbaiki
- **Refresh halaman web tidak lagi kembali ke login**: sesi (token, pengguna, menu terakhir) disimpan di `sessionStorage` (hilang saat tab ditutup) dan dipulihkan saat halaman dibuka; token tetap divalidasi server (kedaluwarsa -> logout otomatis). Smoke test UI memuat halaman lewat `http://` dan menguji refresh sungguhan.

### Diubah
- `ujian.deployForm` mengatur ulang `formSyncedAt`.

## [1.2.2] - 2026-11-06
### Ditambahkan
- Fungsi `diagnosaIzinForms()` (Setup.js) untuk memicu/memeriksa otorisasi Google Forms dari editor Apps Script dan menampilkan URL otorisasi bila izin belum lengkap.

## [1.2.1] - 2026-11-06
### Diperbaiki
- Deploy Google Form yang gagal kini menampilkan **penyebab asli** (`FORM_GAGAL`) alih-alih "Terjadi kesalahan pada server", lengkap dengan petunjuk menjalankan `setup` dan membuat versi deployment baru bila penyebabnya izin Google Forms.
- Tes baru untuk kegagalan `FormApp` di `tests/gform.js`.

## [1.2.0] - 2026-11-06
### Ditambahkan
- **Kode keluar pengawas per ujian**, dibuat oleh guru/admin: dibuat otomatis (6 karakter) saat ujian dibuat, dapat dibuat ulang lewat `ujian.generateKodeKeluar` (tombol *Kode keluar baru* + kolom *Kode keluar* di web admin/guru).
- Endpoint siswa `siswa.sesi.exit` memverifikasi kode di server (tak peka huruf besar/kecil, perbandingan waktu-konstan, 5 percobaan salah per 5 menit → `TOO_MANY_ATTEMPTS`). Kode tidak pernah dikirim ke aplikasi siswa.
- Error baru `KODE_KELUAR_SALAH` dan `KODE_KELUAR_BELUM_ADA`; sheet `Ujian` bertambah kolom `kodeKeluar` (otomatis). Ujian lama belum punya kode: klik *Kode keluar baru*.
- 9 tes baru di `tests/gform.js`.

### Diubah
- `LoginThrottle.assertAllowed` menerima pesan khusus.

## [1.1.0] - 2026-11-06
### Ditambahkan
- **Deploy soal ke Google Form** (`ujian.deployForm`): soal aktif dari semua 5 tipe dipetakan ke item Form (pilihan ganda, kotak centang, isian, paragraf, dropdown per baris untuk menjodohkan). Kolom NIS & Nama wajib ditambahkan otomatis; kunci jawaban **tidak** dimasukkan ke Form. Deploy ulang membangun ulang isi Form yang sama (link tetap).
- **Sinkron hasil** (`hasil.syncForm`): respons Form dibaca, dicocokkan ke sesi lewat NIS, dinilai di server dengan bank soal (inkremental, tahan pengiriman ganda, penanda *terlambat*). Essay tetap dinilai manual di aplikasi.
- **Mode `gform` pada API siswa**: `siswa.ujian.list` menyertakan `mode`; `siswa.ujian.start` untuk ujian ber-Form mengembalikan `formUrl` dengan NIS & nama terisi otomatis (token ujian & timer server tetap berlaku).
- Form otomatis dibuka/ditutup mengikuti status ujian; trigger 5 menit menutup Form yang jadwal tutupnya lewat.
- Penanda *form usang* (`formStale`) bila soal/judul berubah setelah deploy; siswa tidak bisa memulai sampai deploy ulang.
- Mock `FormApp` + `tests/gform.js` (38 tes) dan langkah deploy pada smoke test UI.
- `docs/INTEGRASI-FLUTTER.md` ditulis ulang untuk alur WebView Google Form; panduan alur soal native dipindah ke `docs/INTEGRASI-FLUTTER-NATIVE.md`.

### Diubah
- **Admin kini setara guru** untuk ujian: dapat membuat ujian (atas nama guru pemilik penugasan), soal, peserta, token, deploy, dan melihat/menilai hasil. **Guru kini dapat mengaktifkan/menonaktifkan ujiannya sendiri.** Rute bersama baru: `ujian.save|remove|setAktif`, `soal.save|remove`, `peserta.get|set` (rute `guru.*` dan `admin.ujian.setAktif` tetap ada).
- `GradingService` dipisah menjadi `compute` (murni) dan `gradeSession`.
- Scope OAuth bertambah: `https://www.googleapis.com/auth/forms` (**wajib otorisasi ulang dan deploy versi baru**, lihat README).
- Sheet `Ujian`, `Soal`, `Sesi` bertambah kolom Form (ditambahkan otomatis saat pertama dibuka).
- `docs/API.md`: catatan redirect 302 untuk klien Dart/Flutter.

## [1.0.1] - 2026-11-06
### Diubah
- Nama aplikasi diganti menjadi **ExamForm CBT** (judul tab, halaman login, sidebar, `APP.NAME`, README, docs/API.md, nama paket `examform-cbt`).

## [1.0.0] - 2026-11-06
### Ditambahkan
- Backend Google Apps Script + Google Sheets dengan arsitektur berlapis (`api → services → infra/core`).
- Admin: kelola guru, siswa (impor massal, generate password), mapel, jenis ujian, penugasan guru (mapel + jenis ujian + waktu), aktivasi ujian & soal.
- Guru: buat ujian & soal, atur waktu/jadwal, atur peserta, aktif/nonaktif mapel, token ujian, hasil & koreksi essay.
- API siswa untuk aplikasi Android: login, daftar ujian aktif, mulai dengan token, simpan jawaban, selesai; timer dari server, acak soal & opsi.
- 5 tipe soal: pilihan ganda, multi opsi, isian singkat, essay, menjodohkan.
- Web App admin/guru (HtmlService), dokumentasi (`README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`), tes backend (46) dan smoke test UI.
