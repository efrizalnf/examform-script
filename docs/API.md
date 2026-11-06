# API ExamForm CBT (untuk aplikasi Android)

**Endpoint:** `POST https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`
**Content-Type:** `application/json` (atau `text/plain`). Satu endpoint untuk semua aksi.

```json
{ "action": "namespace.method", "token": "<token login>", "data": { } }
```

Respons selalu HTTP 200 dengan bentuk:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "TOKEN_INVALID", "message": "Token ujian salah." } }
```

> Apps Script membalas POST dengan redirect 302 ke `script.googleusercontent.com`. OkHttp/Retrofit
> mengikutinya otomatis (`followRedirects` default `true`). **Dart/Flutter (`dart:io`, `package:http`) tidak mengikuti redirect untuk POST**:
> ambil hasilnya dengan GET ke header `Location` (lihat `docs/INTEGRASI-FLUTTER.md`). Jangan mengirim header `Authorization`; token dikirim di body.

Health check: `GET .../exec?action=ping`.

## Endpoint siswa

### `auth.login` (publik)
```json
{ "action":"auth.login", "data":{ "role":"siswa", "username":"00123", "password":"aB3dE5gH" } }
```
→ `data`: `{ token, expiresIn, user:{ id, nama, role, nis, kelas, jenjang } }`. Simpan `token`; saat error `UNAUTHORIZED` login ulang.

### `auth.changePassword`
`data: { passwordLama, passwordBaru }`

### `siswa.ujian.list` — dashboard (hanya ujian aktif milik siswa)
→
```json
{ "serverTime":"2026-11-06T03:00:00.000Z",
  "ujian":[{ "id":"ujn_ab12cd34","judul":"UH Gerak","mapel":"Fisika","jenisUjian":"Ulangan Harian","guru":"Bu Sari",
    "durasiMenit":40,"mulai":"","selesai":"","jumlahSoal":10,"mode":"gform|native",
    "status":"belum|berlangsung|selesai","bisaMulai":true,"sesiId":null,"sisaDetik":1234,"nilai":85 }] }
```
`sisaDetik` hanya saat `berlangsung`; `nilai` hanya bila `selesai` dan guru mengizinkan tampil nilai (dan essay sudah dinilai).

### `siswa.ujian.start` — dua mode

`mode` pada daftar ujian menentukan bentuk jawaban. **Mode `gform`** (ujian yang sudah di-*Deploy ke Form* oleh guru/admin; dipakai aplikasi `examenha`):
```json
{ "mode":"gform",
  "sesi":{ "id":"ujn_..:00123","ujianId":"ujn_..","judul":"UH Gerak","durasiMenit":40,"status":"berlangsung",
           "mulai":"ISO","batas":"ISO","sisaDetik":2399,"serverTime":"ISO" },
  "formUrl":"https://docs.google.com/forms/d/e/.../viewform?usp=pp_url&entry.123=00123&entry.456=Ani" }
```
Buka `formUrl` di WebView (NIS & nama sudah terisi). Timer tetap dihitung server (`batas`); saat siswa selesai/waktu habis panggil `siswa.sesi.finish`
(tanpa `answers`). Nilai **tidak** dikembalikan: ia muncul di `siswa.ujian.list` (`nilai`) setelah guru/admin menjalankan `hasil.syncForm`.
Pada mode ini `siswa.jawaban.save` mengembalikan error `MODE_GFORM`.

**Mode `native`** (belum di-deploy; soal dirender aplikasi):
`data: { ujianId, token }` — `token` ujian wajib saat pertama kali; bila sesi sudah berjalan, panggilan ulang
(`token` boleh kosong) **melanjutkan** sesi (mis. aplikasi ditutup/crash). Timer tidak berhenti.
→
```json
{ "sesi":{ "id":"ujn_..:00123","ujianId":"ujn_..","judul":"UH Gerak","durasiMenit":40,"status":"berlangsung",
           "mulai":"ISO","batas":"ISO","sisaDetik":2399,"serverTime":"ISO" },
  "soal":[ ...lihat format soal... ],
  "jawaban":{ "<soalId>": <jawaban tersimpan> } }
```
Hitung mundur di aplikasi dari `sisaDetik` (bukan jam perangkat); sinkronkan ulang dari `sisaDetik` pada tiap respons simpan.

### `siswa.sesi.exit` — verifikasi kode keluar pengawas
`data: { sesiId, kode }` → `{ ok: true }`. Dipanggil saat siswa/pengawas memasukkan kode untuk **keluar sementara** dari ujian.
Kode dibuat guru/admin **per ujian** (`ujian.generateKodeKeluar`), hanya dibandingkan di server (tidak pernah dikirim ke aplikasi),
tidak peka huruf besar/kecil, dan dibatasi 5 percobaan salah per 5 menit per siswa. Keluar sementara **tidak** menghentikan timer server;
siswa dapat *Lanjutkan* dari dashboard. Error: `KODE_KELUAR_SALAH`, `KODE_KELUAR_BELUM_ADA`, `TOO_MANY_ATTEMPTS`, `NOT_FOUND` (bukan sesi milik siswa).

### `siswa.sesi.get`
`data: { sesiId }` → payload yang sama dengan `start` (atau hasil akhir bila sudah selesai).

### `siswa.jawaban.save` — panggil tiap siswa menjawab (boleh batch)
```json
{ "sesiId":"...", "answers":[ { "soalId":"soal_x", "jawaban":"B" } ] }
```
→ `{ saved, sisaDetik, serverTime }`. Bila waktu habis: error `WAKTU_HABIS` → tampilkan layar selesai.

### `siswa.sesi.finish`
`data: { sesiId, answers?: [...] }` — `answers` opsional untuk mengirim jawaban terakhir sekaligus.
→ `{ sesi:{ id, status:"selesai", selesai }, hasil: { nilai, skorPerolehan, skorMaksimum } | null }`

## Format soal dan jawaban

Semua soal: `{ id, nomor, tipe, teks, bobot, ... }`. **Label A/B/C ditentukan UI menurut urutan tampil**; kirim kembali `key`/`id` aslinya.

| tipe | field tambahan | format `jawaban` |
|------|----------------|------------------|
| `pg` | `opsi:[{key,teks}]` | `"B"` (satu `key`) |
| `multi` | `opsi:[{key,teks}]` | `["A","C"]` |
| `isian` | – | `"teks bebas"` |
| `essay` | – | `"teks bebas"` |
| `jodoh` | `pasangan:{ kiri:[{id,teks}], kanan:[{id,teks}] }` | `{ "L1":"R2", "L2":"R1" }` (id kiri → id kanan) |

Penilaian: `pg`/`multi` (benar bila himpunan persis sama)/`isian` (tidak peka huruf besar-kecil & spasi) otomatis; `jodoh` nilai parsial per pasangan; `essay` manual oleh guru.

## Kode error

| code | arti | saran UI |
|------|------|----------|
| `INVALID_CREDENTIALS` | NIS/password salah / akun nonaktif | tampilkan pesan |
| `TOO_MANY_ATTEMPTS` | 5x gagal, terkunci 5 menit | tampilkan pesan |
| `UNAUTHORIZED` | token sesi tidak valid/kedaluwarsa | ke layar login |
| `FORBIDDEN` | peran tidak sesuai | – |
| `TOKEN_INVALID` | token ujian salah | minta ulang input |
| `BUKAN_PESERTA` / `UJIAN_TIDAK_TERSEDIA` | tidak terdaftar / tidak aktif | refresh dashboard |
| `BELUM_DIMULAI` / `SUDAH_DITUTUP` | di luar jadwal | tampilkan jadwal |
| `SUDAH_SELESAI` | sesi sudah selesai | ke layar hasil |
| `WAKTU_HABIS` | batas waktu terlewati | ke layar selesai |
| `FORM_USANG` | soal diubah setelah deploy; guru perlu *Deploy ulang* | tampilkan pesan |
| `FORM_DITUTUP` | form sedang tidak menerima jawaban (ujian dinonaktifkan/jadwal lewat) | tampilkan pesan |
| `KODE_KELUAR_SALAH` | kode keluar pengawas salah | tampilkan pesan, ujian lanjut |
| `KODE_KELUAR_BELUM_ADA` | guru/admin belum membuat kode keluar | minta pengawas membuat kode |
| `MODE_GFORM` | memakai API jawaban pada ujian ber-Form | gunakan WebView |
| `BUSY` | permintaan ganda/server sibuk | ulangi setelah ±1 dtk |
| `VALIDATION_ERROR` | input tidak valid | – |
| `INTERNAL_ERROR` | kesalahan server | coba lagi |

## Contoh Kotlin (Retrofit + Moshi)

```kotlin
data class ApiRequest(val action: String, val token: String? = null, val data: Map<String, Any?> = emptyMap())
data class ApiError(val code: String, val message: String)
data class ApiResponse<T>(val success: Boolean, val data: T?, val error: ApiError?)

interface CbtApi {
    @POST("exec")
    suspend fun login(@Body body: ApiRequest): ApiResponse<LoginData>
    @POST("exec")
    suspend fun examList(@Body body: ApiRequest): ApiResponse<ExamListData>
}

val retrofit = Retrofit.Builder()
    .baseUrl("https://script.google.com/macros/s/<DEPLOYMENT_ID>/")
    .addConverterFactory(MoshiConverterFactory.create())
    .build()

// login
api.login(ApiRequest("auth.login", data = mapOf("role" to "siswa", "username" to nis, "password" to pw)))
// dashboard
api.examList(ApiRequest("siswa.ujian.list", token = session.token))
```

Praktik baik di klien: simpan jawaban ke penyimpanan lokal lalu kirim (antrian + retry) agar tahan koneksi putus; gunakan `FLAG_SECURE`
dan *screen pinning* untuk mode ujian; blokir tombol "mulai" saat `bisaMulai=false`.

## Endpoint admin & guru (dipakai Web UI)

Rute bersama admin **dan** guru (guru dibatasi ke ujiannya sendiri; admin atas semua ujian, membuat ujian atas nama guru pemilik penugasan):
`ujian.list|save|remove|setAktif|generateToken|generateKodeKeluar|deployForm`, `soal.list|save|remove|setAktif`, `peserta.get|set`, `hasil.list|detail|nilaiEssay|syncForm` (`syncForm` menerima `penuh: true` untuk membaca ulang semua respons; default inkremental).

- `ujian.deployForm {id}` → `{formId, formUrl, formEditUrl, jumlahItem, baru}`. Membuat Google Form dari soal aktif (deploy pertama) atau membangun ulang isinya (link tetap). Ditolak bila sudah ada siswa yang mengerjakan.
- `hasil.syncForm {ujianId}` → `{disinkronkan, dilewati, tanpaSesi[], ganda, tanpaNis, terlambat, perluKoreksi, belumMengumpulkan}`. Inkremental dan aman diulang.

Rute lama tetap tersedia: `guru.ujian.*`, `guru.soal.*`, `guru.peserta.*`, `admin.ujian.setAktif`.

Format sama; lihat `src/api/controllers/*` — daftar aksi: `admin.guru.*`, `admin.siswa.*` (`import`, `generatePasswords`),
`admin.mapel.*`, `admin.jenisUjian.*`, `admin.penugasan.*`, `admin.ujian.setAktif`, `ujian.list`, `ujian.generateToken`,
`soal.list`, `soal.setAktif`, `guru.penugasan.*`, `guru.ujian.*`, `guru.soal.*`, `guru.peserta.*`, `hasil.*`.
