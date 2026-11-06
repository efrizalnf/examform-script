# Panduan: Aplikasi Flutter `examenha` → Login → Dashboard → Token → WebView Google Form

Repo aplikasi: <https://github.com/efrizalnf/examenha> (Flutter, BLoC + get_it + dartz, clean architecture per-fitur).
API: `docs/API.md`. Panduan ini mengubah alur aplikasi menjadi:

```
Login NIS ─► Dashboard (ujian aktif yang Anda ikuti) ─► input Token ujian ─► WebView Google Form
              siswa.ujian.list                           siswa.ujian.start       (link form dari server,
                                                         → formUrl + sisaDetik    NIS & nama terisi otomatis)
```

> **Status kode:** ditulis dari pembacaan kode `examenha` v1.5.7, **belum dikompilasi/dijalankan** (tidak ada Flutter SDK di lingkungan
> saya). Jalankan `flutter analyze` dan uji di perangkat. Dua perilaku Google Forms yang saya andalkan **belum diverifikasi di perangkat
> nyata** dan ditandai ⚠ (deteksi halaman "terkirim" dan urutan acak soal).

Yang **dipakai ulang**: `SecurityService` (FLAG_SECURE, lock task, beep), peringatan keamanan, `ExitDialog`, tema, `QrScannerPage`
(kini memindai QR **token**), seluruh `ExamPage` berbasis WebView.
Yang **diganti**: input link/kode lokal (`HomePage`, `HomeBloc`, `HomeRepositoryImpl`, `examAccessCode`) → login + dashboard + token dari server.
Yang **berubah**: timer naik → **hitung mundur dari server**, dan deteksi "form terkirim".

---

## 0. Prasyarat di sisi backend (guru/admin)

1. Update kode Apps Script (`clasp push`), jalankan fungsi apa saja dari editor sekali (mis. `setup`) untuk **menyetujui scope baru
   `…/auth/forms`**, lalu **Deploy → Manage deployments → Edit → New version**.
2. Admin: mapel, jenis ujian, guru, penugasan, siswa. Guru **atau** admin: buat ujian → tambah soal → atur peserta →
   **Deploy ke Form** → aktifkan ujian → bagikan **token** (tombol *Token baru* bila perlu).
3. Uji: `GET …/exec?action=ping` di browser harus mengembalikan JSON. Pastikan deployment *Who has access: **Anyone***.
4. **Form harus bisa diisi tanpa login Google.** Pada akun Google Workspace (mis. `@sma.tarunabakti.sch.id`) form baru sering default
   "dibatasi ke pengguna domain". Backend mencoba `setRequireLogin(false)`, tetapi kebijakan admin domain dapat menolaknya.
   Cek: buka link form di jendela *incognito*; bila diminta login, ubah di **Admin console → Apps → Google Workspace → Drive & Docs / Forms**
   atau di pengaturan Form (*Responses → Restrict to…* dimatikan).

---

## 1. Peta perubahan

```
lib/
├── core/
│   ├── constants/app_constants.dart   UBAH   + apiBaseUrl; HAPUS examAccessCode
│   ├── error/failures.dart            UBAH   + ApiFailure
│   └── network/api_client.dart        BARU   salin dari INTEGRASI-FLUTTER-NATIVE.md §3 (penanganan redirect 302 wajib)
├── features/
│   ├── auth/                          BARU   salin dari NATIVE.md §5 (login NIS, token aman, AuthBloc, AuthGate)
│   ├── dashboard/                     BARU   daftar ujian aktif + dialog token (bagian 3 di bawah)
│   ├── home/                          HAPUS  (setelah migrasi) kecuali QrScannerPage dipakai ulang
│   └── exam/
│       ├── domain/entities/           UBAH   ExamLink + sesiId/sisaDetik; exam_summary.dart baru
│       ├── data/ + domain/repositories BARU  ExamRepository (list, start, finish)
│       └── presentation/              UBAH   ExamBloc (countdown, finish), ExamPage (navigasi dibatasi, deteksi terkirim)
├── injection_container.dart           UBAH
└── main.dart                          UBAH   home: AuthGate
```

```bash
flutter pub add http flutter_secure_storage
```

`app_constants.dart`:
```dart
static const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://script.google.com/macros/s/GANTI_DEPLOYMENT_ID/exec',
);
// HAPUS: examAccessCode  (token kini divalidasi server)
// examExitCode: DIHAPUS — kode keluar kini dari server (§6)
```

---

## 2. Langkah 1–2: ApiClient dan Login

Ikuti **`INTEGRASI-FLUTTER-NATIVE.md` §3** (`ApiClient`, `ApiException`, `ApiFailure`) dan **§5** (`AuthLocalStore`, `AuthRepositoryImpl`, `AuthBloc`,
`LoginPage`, `AuthGate`) apa adanya. Dua hal penting:

- Apps Script membalas POST dengan **302**; `package:http` Dart tidak mengikutinya untuk POST, jadi `ApiClient` harus mengambil hasil dengan
  GET ke header `Location` (sudah ada di kode §3).
- Token login berlaku 6 jam; `UNAUTHORIZED` → `onUnauthorized` → kembali ke login.

---

## 3. Langkah 3: Dashboard + token + mulai ujian

### 3.1 Entitas & model

```dart
// features/exam/domain/entities/exam_summary.dart
import 'package:equatable/equatable.dart';

enum StudentExamStatus { belum, berlangsung, selesai }

class ExamSummary extends Equatable {
  final String id, judul, deskripsi, mapel, jenisUjian, guru;
  final int durasiMenit, jumlahSoal;
  final String mode; // 'gform' | 'native'
  final StudentExamStatus status;
  final bool bisaMulai;
  final String? sesiId, mulai, selesai;
  final int? sisaDetik;
  final num? nilai; // hanya bila guru mengizinkan & sudah disinkronkan/dinilai

  const ExamSummary({
    required this.id, required this.judul, required this.deskripsi, required this.mapel,
    required this.jenisUjian, required this.guru, required this.durasiMenit, required this.jumlahSoal,
    required this.mode, required this.status, required this.bisaMulai,
    this.sesiId, this.mulai, this.selesai, this.sisaDetik, this.nilai,
  });

  bool get isGform => mode == 'gform';

  @override
  List<Object?> get props => [id, status, bisaMulai, sisaDetik, nilai, mode];
}
```

```dart
// features/exam/domain/entities/gform_session.dart  — hasil siswa.ujian.start (mode gform)
class GformSession {
  final String sesiId, ujianId, judul, formUrl;
  final int remainingSeconds;
  const GformSession({
    required this.sesiId, required this.ujianId, required this.judul,
    required this.formUrl, required this.remainingSeconds,
  });
}
```

`ExamLink` (sudah ada) — tambahkan field agar `ExamPage` tahu sesinya:

```dart
class ExamLink extends Equatable {
  final String url;        // formUrl dari server
  final String examCode;   // token yang diinput (tidak lagi divalidasi lokal)
  final String sesiId;
  final String judul;
  final int remainingSeconds;
  const ExamLink({
    required this.url, required this.examCode,
    required this.sesiId, required this.judul, required this.remainingSeconds,
  });
  @override
  List<Object?> get props => [url, examCode, sesiId, remainingSeconds];
}
```

### 3.2 Repository

```dart
// domain/repositories/exam_repository.dart
abstract class ExamRepository {
  Future<Either<Failure, List<ExamSummary>>> listAvailable();

  /// `token` wajib saat pertama kali; kosongkan untuk melanjutkan sesi yang berjalan.
  Future<Either<Failure, GformSession>> start({required String ujianId, String token = ''});

  Future<Either<Failure, void>> finish(String sesiId);
}
```

```dart
// data/repositories/exam_repository_impl.dart
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

  @override
  Future<Either<Failure, List<ExamSummary>>> listAvailable() => _guard(() async {
    final d = await _api.call('siswa.ujian.list') as Map<String, dynamic>;
    return [
      for (final u in (d['ujian'] as List).cast<Map<String, dynamic>>())
        ExamSummary(
          id: u['id'] as String,
          judul: u['judul'] as String,
          deskripsi: (u['deskripsi'] as String?) ?? '',
          mapel: (u['mapel'] as String?) ?? '-',
          jenisUjian: (u['jenisUjian'] as String?) ?? '-',
          guru: (u['guru'] as String?) ?? '-',
          durasiMenit: (u['durasiMenit'] as num).toInt(),
          jumlahSoal: (u['jumlahSoal'] as num).toInt(),
          mode: (u['mode'] as String?) ?? 'native',
          status: StudentExamStatus.values.firstWhere(
            (s) => s.name == u['status'], orElse: () => StudentExamStatus.belum),
          bisaMulai: u['bisaMulai'] == true,
          sesiId: u['sesiId'] as String?,
          mulai: u['mulai'] as String?,
          selesai: u['selesai'] as String?,
          sisaDetik: (u['sisaDetik'] as num?)?.toInt(),
          nilai: u['nilai'] as num?,
        ),
    ];
  });

  @override
  Future<Either<Failure, GformSession>> start({required String ujianId, String token = ''}) =>
      _guard(() async {
        final d = await _api.call('siswa.ujian.start',
            data: {'ujianId': ujianId, 'token': token}) as Map<String, dynamic>;
        final sesi = d['sesi'] as Map<String, dynamic>;
        final url = d['formUrl'] as String?;
        if (d['mode'] != 'gform' || url == null) {
          throw const ApiException('UJIAN_TIDAK_TERSEDIA', 'Ujian ini belum dipublikasikan ke Google Form.');
        }
        return GformSession(
          sesiId: sesi['id'] as String,
          ujianId: sesi['ujianId'] as String,
          judul: sesi['judul'] as String,
          formUrl: url,
          remainingSeconds: (sesi['sisaDetik'] as num).toInt(),
        );
      });

  @override
  Future<Either<Failure, void>> finish(String sesiId) => _guard(() async {
    await _api.call('siswa.sesi.finish', data: {'sesiId': sesiId});
  });
}
```

### 3.3 Dashboard

`ExamListBloc` + `DashboardPage` sama seperti **NATIVE.md §6** (event `ExamListRequested`, `RefreshIndicator`, refresh saat `resumed`). Perbedaan kartu:

| kondisi | tampilan |
|---------|----------|
| `!isGform` | nonaktif — "Belum dipublikasikan oleh guru" |
| `isGform`, `belum`, `bisaMulai` | **Mulai** → dialog token |
| `isGform`, `belum`, `!bisaMulai` | "Belum dibuka" / "Sedang diperbarui guru" |
| `berlangsung` | sisa waktu (`sisaDetik`) + **Lanjutkan** (tanpa token) |
| `selesai` | "Selesai" + `nilai` bila ada |

Memulai ujian (menggantikan `_ExamCodePage`):

```dart
Future<void> _startExam(BuildContext context, ExamSummary exam) async {
  final repo = GetIt.I<ExamRepository>();

  String token = '';
  if (exam.status == StudentExamStatus.belum) {
    final input = await showDialog<String>(
      context: context,
      builder: (_) => const _TokenDialog(), // TextField (textCapitalization: characters) + opsi "Scan QR"
    );
    if (input == null || input.trim().isEmpty) return;
    token = input.trim();
  }

  final r = await repo.start(ujianId: exam.id, token: token);
  if (!context.mounted) return;
  await r.fold<Future<void>>(
    (f) async => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
    (s) async {
      final link = ExamLink(
        url: s.formUrl, examCode: token, sesiId: s.sesiId, judul: s.judul, remainingSeconds: s.remainingSeconds,
      );
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ExamPage(link: link)));
      if (context.mounted) context.read<ExamListBloc>().add(const ExamListRequested());
    },
  );
}
```
Tampilkan indikator loading selama `start` (panggilan pertama Apps Script bisa 2–5 detik; server juga membuat link prefilled lewat Forms) dan cegah klik ganda.
Pesan error server sudah Bahasa Indonesia: `TOKEN_INVALID`, `BUKAN_PESERTA`, `BELUM_DIMULAI`, `SUDAH_DITUTUP`, `FORM_USANG`, `FORM_DITUTUP`, `SUDAH_SELESAI` — tampilkan `failure.message`.

---

## 4. Langkah 4: `ExamBloc` — hitung mundur + selesai

Pertahankan penanganan keamanan & dialog keluar. Ubah hanya timer dan tambahkan penyelesaian.

**Aturan:** jangan percaya jam perangkat. Simpan `remainingSeconds` dari server dan `Stopwatch` (monotonik).

```dart
// exam_event.dart — ExamTimerTickedEvent jadi tanpa parameter; tambahkan:
class ExamFormSubmittedEvent extends ExamEvent { const ExamFormSubmittedEvent(); } // WebView mendeteksi form terkirim
class ExamFinishRetryEvent extends ExamEvent { const ExamFinishRetryEvent(); }

// exam_state.dart — ExamStatus tambah: timeUp, submitted; ExamState tambah: Duration remaining
enum ExamStatus { loading, running, securityAlert, exitPrompt, timeUp, submitted, finished }
```

```dart
class ExamBloc extends Bloc<ExamEvent, ExamState> {
  final SecurityService _security;
  final ExamRepository _repo;
  final ExamLink _link;

  final Stopwatch _clock = Stopwatch();
  Timer? _ticker, _retry;
  StreamSubscription<String>? _securitySub;

  ExamBloc({required SecurityService securityService, required ExamRepository repository, required ExamLink link})
      : _security = securityService, _repo = repository, _link = link,
        super(ExamState(remaining: Duration(seconds: link.remainingSeconds))) {
    on<ExamStartedEvent>(_onStarted);
    on<ExamTimerTickedEvent>(_onTick);
    on<ExamFormSubmittedEvent>(_onSubmitted);
    on<ExamFinishRetryEvent>((e, emit) => _finish(emit));
    // handler keamanan/exit: tetap seperti sebelumnya
    on<ExamSecurityAlertEvent>(_onSecurityAlert);
    on<ExamDismissAlertEvent>(_onDismissAlert);
    on<ExamExitAttemptEvent>(_onExitAttempt);
    on<ExamExitWithCodeEvent>(_onExitWithCode);
    on<ExamCancelExitEvent>(_onCancelExit);
  }

  Future<void> _onStarted(ExamStartedEvent e, Emitter<ExamState> emit) async {
    _clock..reset()..start();
    await _security.startExam();
    emit(state.copyWith(status: ExamStatus.running));
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) { if (!isClosed) add(const ExamTimerTickedEvent()); });
    _securitySub = _security.securityEvents.listen((ev) { if (!isClosed) add(ExamSecurityAlertEvent(ev)); });
  }

  Future<void> _onTick(ExamTimerTickedEvent e, Emitter<ExamState> emit) async {
    final left = (_link.remainingSeconds - _clock.elapsed.inSeconds).clamp(0, 1 << 30);
    emit(state.copyWith(remaining: Duration(seconds: left)));
    if (left == 0 && state.status != ExamStatus.timeUp && state.status != ExamStatus.finished) {
      emit(state.copyWith(status: ExamStatus.timeUp)); // UI mengunci WebView, lalu finish dicoba
      await _finish(emit); // wajib di-await: emit tidak boleh dipanggil setelah handler selesai
    }
  }

  Future<void> _onSubmitted(ExamFormSubmittedEvent e, Emitter<ExamState> emit) async {
    if (state.status == ExamStatus.finished || state.status == ExamStatus.submitted) return;
    emit(state.copyWith(status: ExamStatus.submitted));
    await _finish(emit);
  }

  /// Tandai sesi selesai di server. Gagal jaringan -> coba lagi tiap 5 detik. Nilai TIDAK dikembalikan di sini
  /// (nilai muncul setelah guru menyinkronkan respons Form).
  Future<void> _finish(Emitter<ExamState> emit) async {
    _retry?.cancel();
    final r = await _repo.finish(_link.sesiId);
    r.fold(
      (f) {
        final done = f is ApiFailure && (f.code == 'SUDAH_SELESAI' || f.code == 'NOT_FOUND');
        if (done) { _cleanUp(); emit(state.copyWith(status: ExamStatus.finished)); }
        else { _retry = Timer(const Duration(seconds: 5), () { if (!isClosed) add(const ExamFinishRetryEvent()); }); }
      },
      (_) { _cleanUp(); emit(state.copyWith(status: ExamStatus.finished)); },
    );
  }

  void _cleanUp() { _ticker?.cancel(); _retry?.cancel(); _securitySub?.cancel(); _security.stopExam(); }

  @override
  Future<void> close() { _cleanUp(); return super.close(); }
}
```
`ExamPage` membuat bloc dengan `repository: GetIt.I<ExamRepository>()`. `TimerDisplay`: ganti `session?.formattedElapsed` menjadi `state.remaining`
(format `HH:mm:ss`, warna `AppColors.coral` saat ≤ 5 menit).

> Untuk `_onExitWithCode` lama (menyimpan `ExamStatus.finished`) ganti ke `ExamStatus.exited` agar tidak menampilkan "terkirim".
> Keluar sementara **tidak** menghentikan timer server — siswa dapat **Lanjutkan** dari dashboard (form dibuka lagi, isian Form sebelumnya **hilang** ⚠, lihat §7).

---

## 5. Langkah 5: `ExamPage` — WebView dikunci ke Google Form

Perubahan di `_initWebView`:

```dart
static const _allowedHosts = {'docs.google.com', 'forms.gle', 'forms.google.com'};

_webController = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..setUserAgent(/* tetap seperti sekarang */ '…')
  ..setBackgroundColor(AppColors.background)
  ..setNavigationDelegate(
    NavigationDelegate(
      // Siswa tidak boleh berpindah ke situs lain (link dalam form, dsb.)
      onNavigationRequest: (req) {
        final host = Uri.tryParse(req.url)?.host ?? '';
        return _allowedHosts.contains(host) ? NavigationDecision.navigate : NavigationDecision.prevent;
      },
      onPageFinished: (_) { if (mounted) setState(() => _isWebViewReady = true); },
      // ⚠ Setelah klik "Kirim", Google Forms memuat halaman …/formResponse. Verifikasi di perangkat Anda.
      onUrlChange: (change) {
        final url = change.url ?? '';
        if (url.contains('/formResponse')) {
          context.read<ExamBloc>().add(const ExamFormSubmittedEvent());
        }
      },
      onWebResourceError: (e) => debugPrint('WebView error: ${e.description}'),
    ),
  )
  ..loadRequest(Uri.parse(widget.link.url));
```
`onUrlChange` perlu `webview_flutter` ≥ 4.x (proyek memakai `^4.10.0`, OK). Pastikan `context` aman dipakai (ambil `bloc` dari `context.read` sebelum callback async jika Anda memakai `late final`).

Di `_onStateChange` tambahkan:

```dart
case ExamStatus.timeUp:
  // Kunci layar: tutup form dan tampilkan "Waktu habis"
  _webController.loadRequest(Uri.parse('about:blank'));
  _showInfoDialog(context, 'Waktu ujian habis', 'Jawaban yang sudah Anda kirim tetap tercatat.');
case ExamStatus.submitted:
  _showInfoDialog(context, 'Jawaban terkirim', 'Terima kasih. Nilai akan diumumkan oleh guru.');
case ExamStatus.finished:
  Navigator.of(context).pop(); // kembali ke dashboard
case ExamStatus.exited:
  Navigator.of(context).pop();
```
(`_showInfoDialog` = `AlertDialog` satu tombol "OK", `barrierDismissible: false`; gunakan gaya `_showSecurityAlert` yang ada.)

---

## 6. DI, `main.dart`, kode keluar, versi

`injection_container.dart`:

```dart
sl.registerLazySingleton<ApiClient>(() => ApiClient(baseUrl: AppConstants.apiBaseUrl));
sl.registerLazySingleton<AuthLocalStore>(() => const AuthLocalStore(FlutterSecureStorage()));
sl.registerLazySingleton<AuthRepository>(() => AuthRepositoryImpl(sl(), sl()));
sl.registerLazySingleton<ExamRepository>(() => ExamRepositoryImpl(sl()));
sl.registerLazySingleton<AuthBloc>(() => AuthBloc(sl())..add(const AuthStarted()));
sl.registerFactory<ExamListBloc>(() => ExamListBloc(sl()));
sl<ApiClient>().onUnauthorized = () => sl<AuthBloc>().add(const AuthSessionExpired());
```
`main.dart`: `home: BlocProvider<AuthBloc>.value(value: GetIt.I<AuthBloc>(), child: const AuthGate())`.

**Kode keluar pengawas** kini dibuat guru/admin per ujian (web admin/guru: kolom *Kode keluar*, tombol *Kode keluar baru*) dan diverifikasi
server lewat `siswa.sesi.exit` — tidak ada lagi kode yang tertanam di APK. `ExamBloc._onExitWithCode` memanggil
`ExamRepository.verifyExitCode(sesiId, kode)`; sukses → `ExamStatus.exited` (keluar sementara, timer server jalan terus), gagal → pesan error server
(`KODE_KELUAR_SALAH`, `TOO_MANY_ATTEMPTS`, `KODE_KELUAR_BELUM_ADA`). `AppConstants.examExitCode` dihapus.
**Versi:** samakan `AppConstants.appVersion` (`1.5.2`) dengan `pubspec.yaml` (`1.5.7+6`); rilis ini sebaiknya `1.6.0`.

---

## 7. Batasan Google Form yang perlu diketahui

| Hal | Akibat | Mitigasi |
|-----|--------|----------|
| Form tidak bisa dipaksa kirim saat waktu habis | Siswa yang lewat waktu masih bisa mengirim bila form terbuka | WebView dikunci saat `timeUp`; backend menandai respons **Terlambat** (> batas + 90 dtk) saat sinkron; form otomatis **ditutup** pada jadwal tutup ujian |
| Isian Form hilang bila aplikasi ditutup/di-*kill* | Setelah **Lanjutkan**, form dibuka kosong (Google hanya menyimpan draf untuk akun yang login) | Gunakan screen pinning/lock task agar aplikasi tidak keluar; beri tahu siswa jawaban belum dikirim tidak tersimpan |
| Nilai tidak langsung muncul | Respons Form baru dinilai saat guru/admin menekan **Sinkronkan hasil** | Jadwalkan sinkron setelah ujian; sinkron boleh berulang (inkremental) |
| NIS/Nama terisi otomatis tetapi masih bisa diubah siswa | Siswa bisa mengisi NIS orang lain | Pengawas memeriksa; respons dicocokkan lewat NIS → hanya sesi milik NIS itu; kiriman ganda untuk NIS yang sama diabaikan (yang pertama dipakai) |
| `acakOpsi` tidak berlaku | Urutan opsi sama untuk semua siswa | Acak soal diteruskan ke Form (⚠ perilaku acak pada form bersekat belum diverifikasi) |
| Isian singkat dinilai exact-match | Salah ketik = salah | Beberapa kunci alternatif dapat diisi (satu per baris) |
| Bobot soal | Dihitung **di server** dari bank soal (bobot desimal tetap didukung); Form tidak memakai mode kuis sehingga siswa tidak melihat skor/kunci | – |
| Link form bocor | Pemegang link dapat membuka form tanpa token | Link hanya diberikan setelah token benar; form ditutup bila ujian dinonaktifkan; tidak ada jawaban yang dinilai tanpa sesi yang valid |

---

## 8. Urutan pengerjaan & uji

1. Backend siap (§0). Buat ujian contoh berisi semua tipe soal, 2 siswa uji, **Deploy ke Form**, aktifkan, catat token.
2. `ApiClient` + Login (§2) → Dashboard (§3). Verifikasi: ujian **nonaktif** / siswa **bukan peserta** tidak muncul; ujian belum di-deploy tampil nonaktif.
3. Token salah → pesan "Token ujian salah"; token benar → WebView membuka form dengan **NIS & Nama terisi**.
4. Timer **menurun**; keluar sementara → **Lanjutkan** di dashboard → sisa waktu tidak reset.
5. Kirim form → dialog "Jawaban terkirim" (⚠ verifikasi `/formResponse`) → kembali ke dashboard berstatus **Selesai**.
6. Biarkan waktu habis → WebView terkunci, sesi ditutup. Di web admin/guru: **Hasil → Sinkronkan hasil dari Google Form** → nilai & penanda *Terlambat* tampil; nilai essay dikoreksi lewat **Detail**.
7. `flutter analyze`, uji di perangkat fisik dengan screen pinning. Catat perubahan di `CHANGELOG.md` repo `examenha` dan naikkan versi.
