# Panduan (alternatif): Aplikasi Flutter `examenha` dengan soal NATIVE lewat API ExamForm CBT

> **Catatan:** panduan utama untuk alur *Login → Dashboard → Token → WebView Google Form* ada di `docs/INTEGRASI-FLUTTER.md`. Dokumen ini hanya relevan bila suatu saat soal dirender native (ujian yang **belum** di-deploy ke Form, `mode: "native"`). Bagian ApiClient (§3), Login (§5), dan Dashboard (§6) di sini juga dipakai oleh alur Google Form.


Repo aplikasi: <https://github.com/efrizalnf/examenha> (Flutter, BLoC + get_it + dartz, clean architecture per-fitur).
API: lihat `docs/API.md` (satu endpoint POST `…/exec`, semua aksi lewat `{action, token, data}`).

> **Status kode di panduan ini:** ditulis berdasarkan pembacaan kode `examenha` (versi 1.5.7), **belum dikompilasi/dijalankan**
> (tidak ada Flutter SDK di lingkungan saya). Anggap sebagai titik awal; jalankan `flutter analyze` dan uji di perangkat.

---

## 0. Temuan penting: dua model aplikasi berbeda

`examenha` saat ini adalah **browser ujian aman**: siswa memasukkan link Google Form / Microsoft Form + kode ujian, lalu form dibuka di
`WebView` dengan pengamanan (FLAG_SECURE, lock task, deteksi keluar aplikasi, timer naik, kode keluar). **Tidak ada login dan tidak ada soal native.**

API ExamForm CBT sebaliknya: soal **disimpan di server** dan dikirim ke aplikasi untuk dirender native (5 tipe soal), dengan login siswa,
daftar ujian aktif, token ujian, timer dari server, dan penyimpanan jawaban.

Konsekuensinya, alur aplikasi berubah:

| Sekarang (WebView) | Setelah integrasi (native) |
|--------------------|----------------------------|
| Home → input link/QR → input kode (`AppConstants.examAccessCode`, hard-coded) → WebView | **Login NIS** → **Dashboard ujian aktif** → pilih ujian → **input token ujian** → halaman soal native |
| Timer naik dari 00:00:00 (lokal) | **Hitung mundur** dari `sisaDetik` server |
| Jawaban di Google Form | Jawaban dikirim ke `siswa.jawaban.save`, nilai dihitung server |
| Kode keluar hard-coded | Tombol "Kumpulkan" → `siswa.sesi.finish` (kode pengawas untuk keluar sementara, lihat §9) |

Yang **dipakai ulang tanpa perubahan**: `SecurityService` (FLAG_SECURE/lock task/beep), peringatan keamanan, tema `AppColors`, `BrandLoader`/`BrandLogo`,
`QrScannerPage` (bisa dipakai memindai QR berisi token), `ExitDialog`, `MainActivity.kt`.

> Jika Anda ingin **tetap memakai Google Form** tetapi dengan login + token dari API ini, itu butuh perubahan backend kecil — lihat **§11 (Opsi B)**.

---

## 1. Peta perubahan

```
lib/
├── core/
│   ├── constants/app_constants.dart      UBAH   tambah apiBaseUrl; hapus examAccessCode
│   ├── error/failures.dart               UBAH   tambah ApiFailure
│   └── network/api_client.dart           BARU   klien HTTP (penanganan redirect Apps Script)
├── features/
│   ├── auth/                             BARU   login NIS, simpan token, AuthBloc, LoginPage
│   ├── dashboard/                        BARU   daftar ujian aktif + dialog token
│   └── exam/
│       ├── domain/entities/              UBAH   question.dart, exam_attempt.dart, exam_result.dart (baru)
│       ├── domain/repositories/          BARU   exam_repository.dart
│       ├── data/{models,repositories}/   BARU
│       └── presentation/                 UBAH   ExamBloc (timer mundur + autosave), ExamPage (native), widgets soal
├── injection_container.dart              UBAH
└── main.dart                             UBAH   home: AuthGate
```
`features/home/*` dan `UrlValidator` boleh dibiarkan dulu (dipakai Opsi B) atau dihapus setelah migrasi selesai.

---

## 2. Persiapan

```bash
flutter pub add http flutter_secure_storage
```

`lib/core/constants/app_constants.dart` — tambahkan (dan **hapus** `examAccessCode`, kode itu kini divalidasi server lewat token ujian):

```dart
// URL deployment Web App (…/exec). Bisa dioverride saat build:
//   flutter run --dart-define=API_BASE_URL=https://script.google.com/macros/s/XXXX/exec
static const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://script.google.com/macros/s/GANTI_DEPLOYMENT_ID/exec',
);
```

Pastikan deployment Apps Script: *Execute as: Me*, *Who has access: **Anyone*** (bukan "Anyone with Google account", karena akan membalas halaman login HTML).
`INTERNET` sudah ada di `AndroidManifest.xml`; HTTPS jadi tidak perlu `usesCleartextTraffic`.

Uji cepat sebelum coding: buka `https://script.google.com/macros/s/<ID>/exec?action=ping` di browser → harus keluar JSON `{"success":true,...}`.

---

## 3. Klien HTTP — `core/network/api_client.dart`

**Jebakan utama:** Apps Script membalas POST dengan **HTTP 302** ke `script.googleusercontent.com`. `dart:io`/`package:http` **tidak** mengikuti redirect untuk
POST (kecuali 303), berbeda dengan OkHttp. Hasil POST harus diambil dengan **GET ke alamat `Location`**.

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String code;
  final String message;
  const ApiException(this.code, this.message);

  @override
  String toString() => 'ApiException($code): $message';
}

class ApiClient {
  ApiClient({required this.baseUrl, http.Client? client})
    : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  /// Token login; diisi AuthRepository setelah login / restore sesi.
  String? token;

  /// Dipanggil saat server membalas UNAUTHORIZED (token kedaluwarsa).
  void Function()? onUnauthorized;

  static const _timeout = Duration(seconds: 30);
  static const _redirectCodes = {301, 302, 303, 307, 308};

  /// Mengembalikan isi `data` bila sukses; melempar [ApiException] bila gagal.
  Future<dynamic> call(
    String action, {
    Map<String, dynamic> data = const {},
  }) async {
    final payload = jsonEncode({'action': action, 'token': token, 'data': data});

    final http.Response res;
    try {
      res = await _post(Uri.parse(baseUrl), payload).timeout(_timeout);
    } on TimeoutException {
      throw const ApiException('NETWORK', 'Server tidak merespons. Periksa koneksi internet.');
    } on SocketException {
      throw const ApiException('NETWORK', 'Tidak ada koneksi internet.');
    } on http.ClientException {
      throw const ApiException('NETWORK', 'Gagal terhubung ke server.');
    }

    final Map<String, dynamic> json;
    try {
      json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw const ApiException(
        'BAD_RESPONSE',
        'Respons server tidak valid. Pastikan deployment Web App diset "Anyone".',
      );
    }

    if (json['success'] == true) return json['data'];

    final err = (json['error'] as Map?) ?? const {};
    final code = (err['code'] as String?) ?? 'INTERNAL_ERROR';
    if (code == 'UNAUTHORIZED') onUnauthorized?.call();
    throw ApiException(code, (err['message'] as String?) ?? 'Terjadi kesalahan.');
  }

  Future<http.Response> _post(Uri uri, String body) async {
    final req = http.Request('POST', uri)
      ..followRedirects = false
      ..headers['Content-Type'] = 'text/plain; charset=utf-8' // tanpa preflight, tetap dibaca doPost
      ..body = body;

    var res = await http.Response.fromStream(await _client.send(req));
    var target = uri;
    for (var i = 0; i < 5 && _redirectCodes.contains(res.statusCode); i++) {
      final location = res.headers['location'];
      if (location == null) break;
      target = target.resolve(location);
      res = await _client.get(target); // hasil doPost diambil lewat GET
    }
    return res;
  }
}
```

`core/error/failures.dart` — tambahkan:

```dart
/// Error dari API; `code` mengikuti tabel kode error di docs/API.md.
class ApiFailure extends Failure {
  final String code;
  const ApiFailure(super.message, {required this.code});

  bool get isNetwork => code == 'NETWORK';

  @override
  List<Object> get props => [message, code];
}
```

---

## 4. Domain & data ujian

### 4.1 Entitas (`features/exam/domain/entities/`)

```dart
// exam_summary.dart  (untuk dashboard)
import 'package:equatable/equatable.dart';

enum StudentExamStatus { belum, berlangsung, selesai }

class ExamSummary extends Equatable {
  final String id, judul, deskripsi, mapel, jenisUjian, guru;
  final int durasiMenit, jumlahSoal;
  final StudentExamStatus status;
  final bool bisaMulai;
  final String? sesiId;
  final int? sisaDetik;
  final num? nilai; // hanya ada bila guru mengizinkan & essay sudah dinilai

  const ExamSummary({
    required this.id, required this.judul, required this.deskripsi,
    required this.mapel, required this.jenisUjian, required this.guru,
    required this.durasiMenit, required this.jumlahSoal, required this.status,
    required this.bisaMulai, this.sesiId, this.sisaDetik, this.nilai,
  });

  @override
  List<Object?> get props => [id, status, bisaMulai, sisaDetik, nilai];
}
```

```dart
// question.dart
import 'package:equatable/equatable.dart';

enum QuestionType { pg, multi, isian, essay, jodoh }

class Choice extends Equatable {
  final String key; // key opsi (pg/multi) atau id pasangan (jodoh) — KIRIM BALIK nilai ini
  final String text;
  const Choice(this.key, this.text);
  @override
  List<Object?> get props => [key, text];
}

class Question extends Equatable {
  final String id;
  final int number;
  final QuestionType type;
  final String text;
  final num weight;
  final List<Choice> choices; // pg, multi
  final List<Choice> left;    // jodoh
  final List<Choice> right;   // jodoh

  const Question({
    required this.id, required this.number, required this.type, required this.text,
    required this.weight, this.choices = const [], this.left = const [], this.right = const [],
  });

  @override
  List<Object?> get props => [id, type, text, choices, left, right];
}
```

```dart
// exam_attempt.dart
import 'package:equatable/equatable.dart';
import 'question.dart';

class ExamAttempt extends Equatable {
  final String sesiId, ujianId, judul;
  final int remainingSeconds;
  final List<Question> questions;
  final Map<String, dynamic> answers; // soalId -> jawaban tersimpan (untuk resume)

  const ExamAttempt({
    required this.sesiId, required this.ujianId, required this.judul,
    required this.remainingSeconds, required this.questions, required this.answers,
  });

  @override
  List<Object?> get props => [sesiId, remainingSeconds, questions, answers];
}

// exam_result.dart
class ExamResult {
  final double? score; // null = nilai disembunyikan guru / menunggu koreksi essay
  const ExamResult({this.score});
}
```

### 4.2 Model JSON (`features/exam/data/models/exam_models.dart`)

```dart
import '../../domain/entities/exam_attempt.dart';
import '../../domain/entities/exam_summary.dart';
import '../../domain/entities/question.dart';

ExamSummary examSummaryFromJson(Map<String, dynamic> j) => ExamSummary(
  id: j['id'] as String,
  judul: j['judul'] as String,
  deskripsi: (j['deskripsi'] as String?) ?? '',
  mapel: (j['mapel'] as String?) ?? '-',
  jenisUjian: (j['jenisUjian'] as String?) ?? '-',
  guru: (j['guru'] as String?) ?? '-',
  durasiMenit: (j['durasiMenit'] as num).toInt(),
  jumlahSoal: (j['jumlahSoal'] as num).toInt(),
  status: StudentExamStatus.values.firstWhere(
    (s) => s.name == j['status'],
    orElse: () => StudentExamStatus.belum,
  ),
  bisaMulai: j['bisaMulai'] == true,
  sesiId: j['sesiId'] as String?,
  sisaDetik: (j['sisaDetik'] as num?)?.toInt(),
  nilai: j['nilai'] as num?,
);

List<Choice> _choices(dynamic list, {String keyField = 'key'}) => [
  for (final o in (list as List? ?? const []))
    Choice((o as Map)[keyField] as String, o['teks'] as String),
];

Question questionFromJson(Map<String, dynamic> j) {
  final type = QuestionType.values.byName(j['tipe'] as String); // pg|multi|isian|essay|jodoh
  final pasangan = j['pasangan'] as Map<String, dynamic>?;
  return Question(
    id: j['id'] as String,
    number: (j['nomor'] as num).toInt(),
    type: type,
    text: j['teks'] as String,
    weight: j['bobot'] as num,
    choices: _choices(j['opsi']),
    left: _choices(pasangan?['kiri'], keyField: 'id'),
    right: _choices(pasangan?['kanan'], keyField: 'id'),
  );
}

/// Payload `siswa.ujian.start` / `siswa.sesi.get`.
ExamAttempt examAttemptFromJson(Map<String, dynamic> j) {
  final sesi = j['sesi'] as Map<String, dynamic>;
  return ExamAttempt(
    sesiId: sesi['id'] as String,
    ujianId: sesi['ujianId'] as String,
    judul: sesi['judul'] as String,
    remainingSeconds: (sesi['sisaDetik'] as num).toInt(),
    questions: [for (final q in (j['soal'] as List)) questionFromJson(q as Map<String, dynamic>)],
    answers: Map<String, dynamic>.from((j['jawaban'] as Map?) ?? const {}),
  );
}
```

### 4.3 Repository

```dart
// domain/repositories/exam_repository.dart
import 'package:dartz/dartz.dart';
import '../../../../core/error/failures.dart';
import '../entities/exam_attempt.dart';
import '../entities/exam_result.dart';
import '../entities/exam_summary.dart';

abstract class ExamRepository {
  Future<Either<Failure, List<ExamSummary>>> listAvailable();

  /// `token` wajib untuk start pertama; kosongkan untuk melanjutkan sesi yang sedang berjalan.
  Future<Either<Failure, ExamAttempt>> start({required String ujianId, String token = ''});

  /// Mengembalikan sisa detik menurut server (dipakai menyinkronkan timer).
  Future<Either<Failure, int>> saveAnswers(String sesiId, Map<String, dynamic> answers);

  Future<Either<Failure, ExamResult>> finish(String sesiId, Map<String, dynamic> pendingAnswers);
}
```

```dart
// data/repositories/exam_repository_impl.dart
import 'package:dartz/dartz.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/exam_attempt.dart';
import '../../domain/entities/exam_result.dart';
import '../../domain/entities/exam_summary.dart';
import '../../domain/repositories/exam_repository.dart';
import '../models/exam_models.dart';

class ExamRepositoryImpl implements ExamRepository {
  final ApiClient _api;
  const ExamRepositoryImpl(this._api);

  Future<Either<Failure, T>> _guard<T>(Future<T> Function() run) async {
    try {
      return Right(await run());
    } on ApiException catch (e) {
      return Left(ApiFailure(e.message, code: e.code));
    }
  }

  List<Map<String, dynamic>> _answerList(Map<String, dynamic> a) => [
    for (final e in a.entries) {'soalId': e.key, 'jawaban': e.value},
  ];

  @override
  Future<Either<Failure, List<ExamSummary>>> listAvailable() => _guard(() async {
    final d = await _api.call('siswa.ujian.list') as Map<String, dynamic>;
    return [for (final u in (d['ujian'] as List)) examSummaryFromJson(u as Map<String, dynamic>)];
  });

  @override
  Future<Either<Failure, ExamAttempt>> start({required String ujianId, String token = ''}) =>
      _guard(() async {
        final d = await _api.call('siswa.ujian.start', data: {'ujianId': ujianId, 'token': token});
        return examAttemptFromJson(d as Map<String, dynamic>);
      });

  @override
  Future<Either<Failure, int>> saveAnswers(String sesiId, Map<String, dynamic> answers) =>
      _guard(() async {
        final d = await _api.call('siswa.jawaban.save',
            data: {'sesiId': sesiId, 'answers': _answerList(answers)}) as Map<String, dynamic>;
        return (d['sisaDetik'] as num).toInt();
      });

  @override
  Future<Either<Failure, ExamResult>> finish(String sesiId, Map<String, dynamic> pendingAnswers) =>
      _guard(() async {
        final d = await _api.call('siswa.sesi.finish', data: {
          'sesiId': sesiId,
          if (pendingAnswers.isNotEmpty) 'answers': _answerList(pendingAnswers),
        }) as Map<String, dynamic>;
        final hasil = d['hasil'] as Map<String, dynamic>?;
        return ExamResult(score: (hasil?['nilai'] as num?)?.toDouble());
      });
}
```

> Ikuti pola proyek bila mau: bungkus tiap metode dalam `UseCase` (seperti `ValidateExamUrlUsecase`). Untuk ringkas, BLoC di bawah memakai repository langsung.

---

## 5. Login siswa (`features/auth/`)

**Penyimpanan token** — `data/auth_local_store.dart`:

```dart
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StoredSession {
  final String token;
  final Map<String, dynamic> student; // {nis, nama, kelas, jenjang}
  const StoredSession(this.token, this.student);
}

class AuthLocalStore {
  final FlutterSecureStorage _s;
  const AuthLocalStore(this._s);

  Future<void> save(String token, Map<String, dynamic> student) async {
    await _s.write(key: 'token', value: token);
    await _s.write(key: 'student', value: jsonEncode(student));
  }

  Future<StoredSession?> read() async {
    final t = await _s.read(key: 'token');
    final s = await _s.read(key: 'student');
    if (t == null || s == null) return null;
    return StoredSession(t, jsonDecode(s) as Map<String, dynamic>);
  }

  Future<void> clear() => _s.deleteAll();
}
```

**Entitas & repository** — `Student(nis, nama, kelas, jenjang)` (Equatable). Repository:

```dart
class AuthRepositoryImpl implements AuthRepository {
  final ApiClient _api;
  final AuthLocalStore _store;
  const AuthRepositoryImpl(this._api, this._store);

  @override
  Future<Either<Failure, Student>> login(String nis, String password) async {
    try {
      final d = await _api.call('auth.login', data: {
        'role': 'siswa', 'username': nis.trim(), 'password': password,
      }) as Map<String, dynamic>;
      final user = d['user'] as Map<String, dynamic>;
      _api.token = d['token'] as String;
      await _store.save(_api.token!, user);
      return Right(Student.fromJson(user));
    } on ApiException catch (e) {
      return Left(ApiFailure(e.message, code: e.code));
    }
  }

  /// Pulihkan sesi saat aplikasi dibuka. Token tidak diverifikasi di sini (aplikasi bisa dibuka offline);
  /// bila kedaluwarsa, panggilan API berikutnya mengembalikan UNAUTHORIZED -> onUnauthorized -> logout.
  @override
  Future<Student?> restore() async {
    final s = await _store.read();
    if (s == null) return null;
    _api.token = s.token;
    return Student.fromJson(s.student);
  }

  @override
  Future<void> logout() async {
    _api.token = null;
    await _store.clear();
  }
}
```

**AuthBloc** (singleton, karena global):

```dart
// events: AuthStarted, AuthLoginSubmitted(nis, password), AuthLoggedOut, AuthSessionExpired
// state : status {unknown, authenticated, unauthenticated}, student, isLoading, errorMessage
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final AuthRepository _repo;
  AuthBloc(this._repo) : super(const AuthState()) {
    on<AuthStarted>((e, emit) async {
      final s = await _repo.restore();
      emit(s == null
          ? const AuthState(status: AuthStatus.unauthenticated)
          : AuthState(status: AuthStatus.authenticated, student: s));
    });
    on<AuthLoginSubmitted>((e, emit) async {
      emit(state.copyWith(isLoading: true, clearError: true));
      final r = await _repo.login(e.nis, e.password);
      r.fold(
        (f) => emit(AuthState(status: AuthStatus.unauthenticated, errorMessage: f.message)),
        (s) => emit(AuthState(status: AuthStatus.authenticated, student: s)),
      );
    });
    on<AuthLoggedOut>((e, emit) async {
      await _repo.logout();
      emit(const AuthState(status: AuthStatus.unauthenticated));
    });
    on<AuthSessionExpired>((e, emit) async {
      await _repo.logout();
      emit(const AuthState(
        status: AuthStatus.unauthenticated,
        errorMessage: 'Sesi login berakhir. Silakan masuk kembali.',
      ));
    });
  }
}
```

**LoginPage** — dua `TextField` (NIS: `keyboardType: TextInputType.number`; password: `obscureText`) + tombol yang mengirim
`AuthLoginSubmitted`. Tampilkan `state.errorMessage` dan nonaktifkan tombol saat `isLoading`. Pesan `TOO_MANY_ATTEMPTS`
dan `INVALID_CREDENTIALS` sudah berbahasa Indonesia dari server. **Jangan** `trim()` password; **boleh** `trim()` NIS.

**AuthGate** (`home:` di `MaterialApp`):

```dart
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (_, s) => switch (s.status) {
        AuthStatus.unknown => const Scaffold(body: Center(child: BrandLoader(size: 96))),
        AuthStatus.authenticated => const DashboardPage(),
        AuthStatus.unauthenticated => const LoginPage(),
      },
    );
  }
}
```

---

## 6. Dashboard ujian aktif (`features/dashboard/`)

Server hanya mengirim ujian yang **aktif**, milik siswa tersebut, dan masih dalam jadwal — tidak perlu filter di klien.

```dart
// ExamListBloc: event ExamListRequested; state {status: loading|loaded|failure, exams, error}
class ExamListBloc extends Bloc<ExamListEvent, ExamListState> {
  final ExamRepository _repo;
  ExamListBloc(this._repo) : super(const ExamListState()) {
    on<ExamListRequested>((e, emit) async {
      if (state.exams.isEmpty) emit(state.copyWith(status: ExamListStatus.loading));
      final r = await _repo.listAvailable();
      r.fold(
        (f) => emit(state.copyWith(status: ExamListStatus.failure, error: f.message)),
        (list) => emit(ExamListState(status: ExamListStatus.loaded, exams: list)),
      );
    });
  }
}
```

`DashboardPage`: `BlocProvider(create: (_) => GetIt.I<ExamListBloc>()..add(const ExamListRequested()))`, dibungkus `RefreshIndicator`
(`onRefresh` → add event, tunggu state berubah) dan `WidgetsBindingObserver` agar refresh saat `AppLifecycleState.resumed`.
Header: nama, kelas, tombol keluar (`AuthLoggedOut`). Tiap kartu:

| `status` | Tampilan | Tombol |
|----------|----------|--------|
| `belum` & `bisaMulai` | judul, mapel, guru, `durasiMenit` menit, `jumlahSoal` soal | **Mulai** (minta token) |
| `belum` & `!bisaMulai` | tampil jadwal `mulai` | nonaktif ("Belum dibuka") |
| `berlangsung` | sisa waktu dari `sisaDetik` | **Lanjutkan** (tanpa token) |
| `selesai` | "Selesai" + `nilai` bila ada | – |

**Memulai ujian** (token dialog menggantikan `_ExamCodePage`):

```dart
Future<void> _startExam(BuildContext context, ExamSummary exam) async {
  final repo = GetIt.I<ExamRepository>();

  // Sesi sudah berjalan -> lanjutkan tanpa token.
  String token = '';
  if (exam.status == StudentExamStatus.belum) {
    final input = await showDialog<String>(
      context: context,
      builder: (_) => const _TokenDialog(), // TextField uppercase + tombol "Mulai"
    );
    if (input == null || input.trim().isEmpty) return;
    token = input.trim();
  }

  final r = await repo.start(ujianId: exam.id, token: token);
  if (!context.mounted) return;
  r.fold(
    (f) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
    (attempt) async {
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ExamPage(attempt: attempt)));
      if (context.mounted) context.read<ExamListBloc>().add(const ExamListRequested());
    },
  );
}
```
Tampilkan indikator loading saat `start` berjalan (Apps Script bisa 2–5 detik pada panggilan pertama/cold start) dan cegah klik ganda.
`QrScannerPage` yang sudah ada bisa dipakai mengisi kolom token dari QR (guru cukup menampilkan token sebagai QR di layar).

---

## 7. Mengubah `ExamBloc` — timer mundur + autosave

Inilah inti perubahan. Pertahankan penanganan keamanan & dialog keluar yang sudah ada; ganti timer naik dengan **hitung mundur yang disinkronkan server**
dan tambahkan penyimpanan jawaban.

**Aturan timer:** jangan percaya jam perangkat. Simpan `sisaDetik` dari server + `Stopwatch` (monotonik, tidak terpengaruh
perubahan jam), lalu **sinkronkan ulang** setiap respons `siswa.jawaban.save` (yang selalu mengembalikan `sisaDetik`).

**Aturan jawaban:** simpan lokal dulu → kirim *debounced* (±700 ms) dalam batch → bila gagal, tetap `dirty` dan dicoba ulang
tiap 10 detik. Saat selesai, kirim **hanya jawaban yang belum tersimpan** lewat `finish` (mengirim ratusan jawaban sekaligus
bisa melewati batas waktu 30 dtk karena tiap jawaban = 1 penulisan sheet).

### exam_event.dart — tambahkan

```dart
class ExamAnswerChangedEvent extends ExamEvent {
  final String questionId;
  final dynamic value; // String | List<String> | Map<String,String>
  const ExamAnswerChangedEvent(this.questionId, this.value);
  @override
  List<Object?> get props => [questionId, value];
}

class ExamQuestionSelectedEvent extends ExamEvent {
  final int index;
  const ExamQuestionSelectedEvent(this.index);
  @override
  List<Object?> get props => [index];
}

class ExamSubmitRequestedEvent extends ExamEvent { const ExamSubmitRequestedEvent(); } // buka dialog konfirmasi
class ExamSubmitConfirmedEvent extends ExamEvent {
  final bool auto; // true = waktu habis
  const ExamSubmitConfirmedEvent({this.auto = false});
  @override
  List<Object?> get props => [auto];
}
class ExamSaveResultEvent extends ExamEvent {
  final int pending;
  final String? error;
  const ExamSaveResultEvent({required this.pending, this.error});
  @override
  List<Object?> get props => [pending, error];
}
```
Ubah `ExamTimerTickedEvent` menjadi tanpa parameter (`const ExamTimerTickedEvent()`).

### exam_state.dart

```dart
enum ExamStatus { loading, running, securityAlert, exitPrompt, submitPrompt, submitting, finished, exited }

class ExamState extends Equatable {
  final ExamAttempt attempt;
  final ExamStatus status;
  final Map<String, dynamic> answers;
  final int currentIndex;
  final Duration remaining;
  final int pendingCount;     // jawaban belum tersimpan di server
  final String? saveError;    // pesan bila penyimpanan gagal
  final String? alertMessage, exitCodeError;
  final ExamResult? result;

  const ExamState({
    required this.attempt,
    this.status = ExamStatus.loading,
    this.answers = const {},
    this.currentIndex = 0,
    this.remaining = Duration.zero,
    this.pendingCount = 0,
    this.saveError,
    this.alertMessage,
    this.exitCodeError,
    this.result,
  });

  Question get currentQuestion => attempt.questions[currentIndex];
  bool isAnswered(String id) {
    final v = answers[id];
    return v != null && v.toString().isNotEmpty && v.toString() != '[]' && v.toString() != '{}';
  }

  ExamState copyWith({
    ExamStatus? status, Map<String, dynamic>? answers, int? currentIndex, Duration? remaining,
    int? pendingCount, String? saveError, String? alertMessage, String? exitCodeError, ExamResult? result,
    bool clearSaveError = false, bool clearAlert = false, bool clearExitError = false,
  }) => ExamState(
    attempt: attempt,
    status: status ?? this.status,
    answers: answers ?? this.answers,
    currentIndex: currentIndex ?? this.currentIndex,
    remaining: remaining ?? this.remaining,
    pendingCount: pendingCount ?? this.pendingCount,
    saveError: clearSaveError ? null : (saveError ?? this.saveError),
    alertMessage: clearAlert ? null : (alertMessage ?? this.alertMessage),
    exitCodeError: clearExitError ? null : (exitCodeError ?? this.exitCodeError),
    result: result ?? this.result,
  );

  @override
  List<Object?> get props => [status, answers, currentIndex, remaining, pendingCount, saveError, alertMessage, exitCodeError, result];
}
```

### exam_bloc.dart (ganti isi; bagian keamanan/exit tetap seperti aslinya)

```dart
class ExamBloc extends Bloc<ExamEvent, ExamState> {
  final SecurityService _security;
  final ExamRepository _repo;
  final ExamAttempt _attempt;

  final Map<String, dynamic> _answers;
  final Set<String> _dirty = {};
  final Stopwatch _clock = Stopwatch();
  int _baseRemaining;
  int _ticks = 0;
  bool _saving = false;

  Timer? _ticker, _debounce, _retrySubmit;
  StreamSubscription<String>? _securitySub;

  ExamBloc({
    required SecurityService securityService,
    required ExamRepository repository,
    required ExamAttempt attempt,
  })  : _security = securityService,
        _repo = repository,
        _attempt = attempt,
        _answers = Map.of(attempt.answers),
        _baseRemaining = attempt.remainingSeconds,
        super(ExamState(attempt: attempt, answers: Map.of(attempt.answers),
            remaining: Duration(seconds: attempt.remainingSeconds))) {
    on<ExamStartedEvent>(_onStarted);
    on<ExamTimerTickedEvent>(_onTick);
    on<ExamAnswerChangedEvent>(_onAnswerChanged);
    on<ExamQuestionSelectedEvent>((e, emit) =>
        emit(state.copyWith(currentIndex: e.index.clamp(0, _attempt.questions.length - 1))));
    on<ExamSaveResultEvent>((e, emit) => emit(
        state.copyWith(pendingCount: e.pending, saveError: e.error, clearSaveError: e.error == null)));
    on<ExamSubmitRequestedEvent>((e, emit) {
      _security.beep();
      emit(state.copyWith(status: ExamStatus.submitPrompt));
    });
    on<ExamSubmitConfirmedEvent>(_onSubmit);
    // ↓ handler keamanan & keluar: salin dari versi lama (_onSecurityAlert, _onDismissAlert,
    //   _onExitAttempt, _onExitWithCode -> emit status: ExamStatus.exited, _onCancelExit)
    on<ExamSecurityAlertEvent>(_onSecurityAlert);
    on<ExamDismissAlertEvent>(_onDismissAlert);
    on<ExamExitAttemptEvent>(_onExitAttempt);
    on<ExamExitWithCodeEvent>(_onExitWithCode);
    on<ExamCancelExitEvent>(_onCancelExit);
  }

  // ---------- start & timer ----------
  Future<void> _onStarted(ExamStartedEvent e, Emitter<ExamState> emit) async {
    _clock..reset()..start();
    await _security.startExam();
    emit(state.copyWith(status: ExamStatus.running));

    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!isClosed) add(const ExamTimerTickedEvent());
    });
    _securitySub = _security.securityEvents.listen((ev) {
      if (!isClosed) add(ExamSecurityAlertEvent(ev));
    });
  }

  int get _remainingSeconds => (_baseRemaining - _clock.elapsed.inSeconds).clamp(0, 1 << 30);

  void _resync(int serverRemaining) {
    _baseRemaining = serverRemaining;
    _clock..reset()..start();
  }

  void _onTick(ExamTimerTickedEvent e, Emitter<ExamState> emit) {
    final left = _remainingSeconds;
    emit(state.copyWith(remaining: Duration(seconds: left)));
    if (++_ticks % 10 == 0) _flush();                 // coba ulang jawaban yang belum terkirim
    if (left == 0 && state.status != ExamStatus.submitting && state.status != ExamStatus.finished) {
      add(const ExamSubmitConfirmedEvent(auto: true)); // waktu habis -> kumpulkan otomatis
    }
  }

  // ---------- jawaban ----------
  void _onAnswerChanged(ExamAnswerChangedEvent e, Emitter<ExamState> emit) {
    _answers[e.questionId] = e.value;
    _dirty.add(e.questionId);
    emit(state.copyWith(answers: Map.of(_answers), pendingCount: _dirty.length));
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 700), _flush);
  }

  Future<void> _flush() async {
    if (_saving || _dirty.isEmpty || isClosed) return;
    _saving = true;
    final ids = _dirty.toList();
    _dirty.removeAll(ids);
    final batch = {for (final id in ids) id: _answers[id]};

    final r = await _repo.saveAnswers(_attempt.sesiId, batch);
    _saving = false;
    if (isClosed) return;

    r.fold(
      (f) {
        _dirty.addAll(ids); // coba lagi nanti
        if (f is ApiFailure && (f.code == 'WAKTU_HABIS' || f.code == 'SUDAH_SELESAI')) {
          add(const ExamSubmitConfirmedEvent(auto: true));
        } else {
          add(ExamSaveResultEvent(pending: _dirty.length, error: f.message));
        }
      },
      (remaining) {
        _resync(remaining);
        add(ExamSaveResultEvent(pending: _dirty.length));
        if (_dirty.isNotEmpty) _flush(); // ada perubahan baru saat request berjalan
      },
    );
  }

  // ---------- kumpulkan ----------
  Future<void> _onSubmit(ExamSubmitConfirmedEvent e, Emitter<ExamState> emit) async {
    if (state.status == ExamStatus.finished) return;
    _debounce?.cancel();
    _retrySubmit?.cancel();
    emit(state.copyWith(status: ExamStatus.submitting, clearSaveError: true));

    final pending = {for (final id in _dirty) id: _answers[id]};
    final r = await _repo.finish(_attempt.sesiId, pending);

    r.fold(
      (f) {
        final done = f is ApiFailure && f.code == 'SUDAH_SELESAI'; // sesi sudah ditutup server (waktu habis)
        if (done) {
          emit(state.copyWith(status: ExamStatus.finished, result: const ExamResult()));
        } else if (e.auto) {
          // Waktu habis tapi jaringan bermasalah: terus coba sampai berhasil.
          emit(state.copyWith(saveError: 'Menunggu koneksi untuk mengirim jawaban…'));
          _retrySubmit = Timer(const Duration(seconds: 5), () {
            if (!isClosed) add(const ExamSubmitConfirmedEvent(auto: true));
          });
        } else {
          emit(state.copyWith(status: ExamStatus.running, saveError: f.message));
        }
      },
      (result) {
        _dirty.clear();
        emit(state.copyWith(status: ExamStatus.finished, result: result, pendingCount: 0));
      },
    );
  }

  void _cleanUp() {
    _ticker?.cancel();
    _debounce?.cancel();
    _retrySubmit?.cancel();
    _securitySub?.cancel();
    _security.stopExam();
  }

  @override
  Future<void> close() {
    _cleanUp();
    return super.close();
  }
}
```
Panggil `_cleanUp()` juga saat status menjadi `finished`/`exited` (seperti `_onExitWithCode` lama).

---

## 8. `ExamPage` — ganti WebView dengan soal native

Perubahan pada `exam_page.dart`:

1. `ExamPage({required ExamAttempt attempt})`; di `create:` suntikkan `repository: GetIt.I<ExamRepository>()` dan `attempt`.
2. Hapus `WebViewController`, `_initWebView`, `WebViewWidget`, `_isWebViewReady`, dan overlay loading (data sudah ada saat halaman dibuka).
   `webview_flutter` tetap di `pubspec.yaml` hanya bila Opsi B dipakai.
3. Pertahankan `didChangeAppLifecycleState` (peringatan keluar aplikasi tetap berguna).
4. Body baru (ganti `Stack` lama):

```dart
body: SafeArea(
  child: Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _ExitButton(onPressed: () => context.read<ExamBloc>().add(const ExamExitAttemptEvent())),
            const _SaveIndicator(),   // "Tersimpan" / "Menyimpan…" / "Belum tersimpan ⚠"
            const TimerDisplay(),     // ubah ke hitung mundur, lihat di bawah
          ],
        ),
      ),
      const Expanded(child: _QuestionBody()),
      const _BottomBar(),             // Sebelumnya | No. (buka grid) | Berikutnya / Kumpulkan
    ],
  ),
),
```

5. `_onStateChange`: tambahkan kasus

```dart
case ExamStatus.submitPrompt:
  _showSubmitConfirm(context); // "Kumpulkan jawaban? N soal belum dijawab" → Confirmed / Cancel(ExamCancelExitEvent)
case ExamStatus.finished:
  _showResultThenPop(context, state.result); // nilai bila ada, jika tidak "Jawaban terkirim"
case ExamStatus.exited:
  Navigator.of(context).pop();
```
(`finished` lama langsung `pop()`; kini tampilkan dialog hasil dulu.) Selama `submitting`, tampilkan overlay loading dan blokir tombol.

6. **`TimerDisplay`** — ubah dua baris saja:

```dart
buildWhen: (p, c) => p.remaining != c.remaining,
builder: (context, state) {
  final r = state.remaining;
  final time = '${r.inHours.toString().padLeft(2, '0')}:'
      '${(r.inMinutes % 60).toString().padLeft(2, '0')}:'
      '${(r.inSeconds % 60).toString().padLeft(2, '0')}';
  final warn = r.inSeconds <= 300; // merah di 5 menit terakhir
```
Gunakan `AppColors.coral` untuk teks bila `warn`.

7. **`_QuestionBody`** — `BlocBuilder<ExamBloc, ExamState>`, tampilkan `state.currentQuestion` dalam `SingleChildScrollView`:

```dart
QuestionView(
  key: ValueKey(q.id),
  question: q,
  answer: state.answers[q.id],
  onChanged: (v) => context.read<ExamBloc>().add(ExamAnswerChangedEvent(q.id, v)),
)
```

### widgets/question_view.dart

```dart
class QuestionView extends StatelessWidget {
  final Question question;
  final dynamic answer;
  final ValueChanged<dynamic> onChanged;
  const QuestionView({super.key, required this.question, required this.answer, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final q = question;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Soal ${q.number}', style: const TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(q.text, style: const TextStyle(fontSize: 16, height: 1.45, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          switch (q.type) {
            QuestionType.pg => _SingleChoice(q: q, selected: answer as String?, onChanged: onChanged),
            QuestionType.multi => _MultiChoice(q: q, selected: _asStrings(answer), onChanged: onChanged),
            QuestionType.isian => _TextAnswer(initial: answer as String?, hint: 'Ketik jawaban singkat', lines: 1, onChanged: onChanged),
            QuestionType.essay => _TextAnswer(initial: answer as String?, hint: 'Tulis jawaban Anda', lines: 8, onChanged: onChanged),
            QuestionType.jodoh => _Matching(q: q, value: _asMap(answer), onChanged: onChanged),
          },
        ],
      ),
    );
  }
}

List<String> _asStrings(dynamic v) => [for (final e in (v as List? ?? const [])) e.toString()];
Map<String, String> _asMap(dynamic v) => {
  for (final e in ((v as Map?) ?? const {}).entries) e.key.toString(): e.value.toString(),
};

String _letter(int i) => String.fromCharCode(65 + i); // label A,B,C mengikuti URUTAN TAMPIL

class _SingleChoice extends StatelessWidget {
  final Question q; final String? selected; final ValueChanged<dynamic> onChanged;
  const _SingleChoice({required this.q, required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) => Column(children: [
    for (var i = 0; i < q.choices.length; i++)
      Card(
        child: ListTile(
          leading: Icon(selected == q.choices[i].key ? Icons.radio_button_checked : Icons.radio_button_off,
              color: AppColors.primary),
          title: Text('${_letter(i)}. ${q.choices[i].text}'),
          onTap: () => onChanged(q.choices[i].key), // kirim KEY asli, bukan huruf
        ),
      ),
  ]);
}

class _MultiChoice extends StatelessWidget {
  final Question q; final List<String> selected; final ValueChanged<dynamic> onChanged;
  const _MultiChoice({required this.q, required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) => Column(children: [
    const Align(alignment: Alignment.centerLeft, child: Text('Pilih satu atau lebih jawaban.')),
    for (var i = 0; i < q.choices.length; i++)
      CheckboxListTile(
        value: selected.contains(q.choices[i].key),
        title: Text('${_letter(i)}. ${q.choices[i].text}'),
        onChanged: (on) {
          final next = [...selected]..remove(q.choices[i].key);
          if (on == true) next.add(q.choices[i].key);
          onChanged(next);
        },
      ),
  ]);
}

class _TextAnswer extends StatefulWidget {
  final String? initial; final String hint; final int lines; final ValueChanged<dynamic> onChanged;
  const _TextAnswer({required this.initial, required this.hint, required this.lines, required this.onChanged});
  @override
  State<_TextAnswer> createState() => _TextAnswerState();
}

class _TextAnswerState extends State<_TextAnswer> {
  late final _c = TextEditingController(text: widget.initial ?? '');
  @override
  void dispose() { _c.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _c,
    minLines: widget.lines,
    maxLines: widget.lines == 1 ? 1 : null,
    decoration: InputDecoration(hintText: widget.hint, border: const OutlineInputBorder()),
    onChanged: widget.onChanged, // debounce sudah ada di ExamBloc
  );
}

class _Matching extends StatelessWidget {
  final Question q; final Map<String, String> value; final ValueChanged<dynamic> onChanged;
  const _Matching({required this.q, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) => Column(children: [
    for (final l in q.left)
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: InputDecorator(
          decoration: InputDecoration(labelText: l.text, border: const OutlineInputBorder()),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: value[l.key],
              hint: const Text('Pilih pasangan'),
              items: [for (final r in q.right) DropdownMenuItem(value: r.key, child: Text(r.text))],
              onChanged: (r) => onChanged({...value, l.key: r}), // { idKiri: idKanan }
            ),
          ),
        ),
      ),
  ]);
}
```

`_BottomBar`: tombol *Sebelumnya* / *Berikutnya* mengirim `ExamQuestionSelectedEvent(index ± 1)`; di soal terakhir tombol kanan menjadi
**Kumpulkan** (`ExamSubmitRequestedEvent`). Tombol nomor membuka `showModalBottomSheet` berisi `Wrap` kotak nomor
(`state.isAnswered(q.id)` → warna `AppColors.primary` vs abu-abu) yang memanggil `ExamQuestionSelectedEvent(i)`.

---

## 9. DI, `main.dart`, dan hal yang perlu diputuskan

`injection_container.dart` tambahkan:

```dart
sl.registerLazySingleton<ApiClient>(() => ApiClient(baseUrl: AppConstants.apiBaseUrl));
sl.registerLazySingleton<AuthLocalStore>(() => const AuthLocalStore(FlutterSecureStorage()));
sl.registerLazySingleton<AuthRepository>(() => AuthRepositoryImpl(sl(), sl()));
sl.registerLazySingleton<ExamRepository>(() => ExamRepositoryImpl(sl()));
sl.registerLazySingleton<AuthBloc>(() => AuthBloc(sl())..add(const AuthStarted())); // singleton: global
sl.registerFactory<ExamListBloc>(() => ExamListBloc(sl()));

// Token kedaluwarsa di mana pun -> kembali ke login
sl<ApiClient>().onUnauthorized = () => sl<AuthBloc>().add(const AuthSessionExpired());
```

`main.dart`: ganti `home:` menjadi

```dart
home: BlocProvider<AuthBloc>.value(value: GetIt.I<AuthBloc>(), child: const AuthGate()),
```

**Kode keluar pengawas (`examExitCode`).** Saat ini hard-coded `'111290'` di APK — siapa pun yang membongkar APK dapat membacanya. Pilihan:
(a) hapus fitur keluar-dengan-kode; "Keluar" cukup membuka konfirmasi *Kumpulkan* (aman: siswa yang keluar sementara tetap bisa **lanjut** karena
timer dan jawaban ada di server); (b) pertahankan sebagai kode lokal sementara; (c) minta saya menambah aksi backend `siswa.sesi.exitCode`
(kode per ujian dari guru). Rekomendasi: (a) atau (c).

**Versi:** `AppConstants.appVersion` (`1.5.2`) tidak sama dengan `pubspec.yaml` (`1.5.7+6`); samakan, naikkan ke `1.6.0` untuk rilis integrasi.

---

## 10. Penanganan error & ketahanan (checklist)

| Kondisi | Perilaku yang disarankan |
|---------|--------------------------|
| `NETWORK` saat login/dashboard | Snackbar + tombol coba lagi |
| `NETWORK` saat simpan jawaban | Jawaban tetap di memori, indikator "Belum tersimpan", dicoba ulang tiap 10 dtk (sudah di `ExamBloc`) |
| Aplikasi ditutup/crash saat ujian | Dashboard menampilkan **Lanjutkan**; `start` tanpa token memulihkan soal + jawaban + sisa waktu |
| `WAKTU_HABIS` / `SUDAH_SELESAI` | `ExamBloc` otomatis `finish` lalu tampilkan hasil |
| `BUSY` | Ulangi otomatis setelah ±1 dtk (maks. 3×) di `ApiClient`/repository bila perlu |
| `UNAUTHORIZED` | Logout otomatis (`onUnauthorized`); bila terjadi **di tengah ujian**, jawaban yang sudah tersimpan aman di server — login ulang lalu **Lanjutkan** |
| `BELUM_DIMULAI`, `SUDAH_DITUTUP`, `TOKEN_INVALID`, `BUKAN_PESERTA` | Tampilkan `failure.message` apa adanya (sudah bahasa Indonesia) |

Peningkatan opsional: simpan `_answers` ke penyimpanan lokal (kunci `sesiId`) agar jawaban selamat dari *crash + tanpa internet*;
saat resume, gabungkan dengan `attempt.answers` dari server (jawaban lokal yang lebih baru menang).

---

## 11. Opsi B — tetap memakai Google Form / Microsoft Form

Jika siswa tetap mengerjakan di WebView tetapi Anda ingin login NIS, daftar ujian aktif, dan token dari API:

- **Backend (perubahan kecil, belum ada saat ini):** tambah kolom `linkForm` pada sheet `Ujian`, field di form guru, dan sertakan di `siswa.ujian.list`
  serta di respons `siswa.ujian.start` (tanpa soal). Penilaian tetap di Google Form.
- **Aplikasi:** alur sama (Login → Dashboard → Token), tetapi setelah `start` berhasil buka `ExamLink(url: linkForm, examCode: token)` ke `ExamPage`
  WebView yang **sudah ada**. Hanya `HomeRepositoryImpl` (validasi kode lokal) yang digantikan panggilan `siswa.ujian.start`.

Beri tahu saya bila ingin Opsi B atau kode keluar per ujian (§9c); backend-nya saya tambahkan beserta tes dan catatan di `CHANGELOG.md`.

---

## 12. Urutan pengerjaan & pengujian

1. Backend siap & ping berhasil (§2). Buat 1 guru, 1 ujian (semua tipe soal), 2 siswa, aktifkan ujian, catat token.
2. §2–§3 (`ApiClient`) → uji login dari `main()` sementara dengan `print`. Unit test dengan `MockClient` (`package:http/testing.dart`):
   respons 302 + `Location` harus berujung pada GET kedua.
3. §5 Login → §6 Dashboard (verifikasi: ujian yang **tidak** aktif / siswa bukan peserta **tidak muncul**).
4. §4 & §7–§8 Ujian: periksa
   - timer **menurun** dan tetap benar setelah aplikasi di-*kill* lalu **Lanjutkan** (sisa waktu bukan reset);
   - ubah jawaban → muncul "Menyimpan…" lalu "Tersimpan"; matikan data seluler → "Belum tersimpan" → nyalakan → tersimpan otomatis;
   - semua 5 tipe soal terkirim format benar (`pg` string, `multi` list key, `jodoh` map `{idKiri:idKanan}`);
   - biarkan waktu habis → otomatis terkumpul; spreadsheet sheet `Sesi` berstatus `selesai`;
   - kunci jawaban **tidak** terlihat pada payload (cek log jaringan).
5. `flutter analyze`, lalu uji di perangkat fisik dengan screen pinning aktif (perilaku `SecurityService` tidak berubah).
6. Catat di `CHANGELOG.md` repo masing-masing (backend: `examform-script`, aplikasi: `examenha`) dan naikkan versi.
