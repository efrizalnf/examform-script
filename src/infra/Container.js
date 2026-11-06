/**
 * Dependency container sederhana (lazy singleton per eksekusi).
 * Satu-satunya tempat yang tahu cara merakit objek -> layanan mudah diuji dan diganti.
 */
const Container = {
  _instances: {},
  _factories: null,

  get(name) {
    if (!this._factories) this._factories = this._buildFactories();
    if (!this._instances[name]) {
      const factory = this._factories[name];
      if (!factory) throw new Error(`Dependency tidak terdaftar: ${name}`);
      this._instances[name] = factory();
    }
    return this._instances[name];
  },

  /** Hanya untuk pengujian. */
  reset() { this._instances = {}; this._factories = null; },

  _buildFactories() {
    const g = (n) => this.get(n);
    const repo = (key) => () => new SheetRepository(Schema[key], SpreadsheetProvider);
    return {
      // repositories
      'repo.users': repo('users'),
      'repo.siswa': repo('siswa'),
      'repo.mapel': repo('mapel'),
      'repo.jenisUjian': repo('jenisUjian'),
      'repo.penugasan': repo('penugasan'),
      'repo.ujian': repo('ujian'),
      'repo.soal': repo('soal'),
      'repo.peserta': repo('peserta'),
      'repo.sesi': repo('sesi'),
      'repo.jawaban': repo('jawaban'),

      // security
      passwordService: () => new PasswordService(),
      authTokenService: () => new AuthTokenService(),
      loginThrottle: () => new LoginThrottle(),
      authService: () => new AuthService({
        users: g('repo.users'), siswa: g('repo.siswa'),
        passwords: g('passwordService'), tokens: g('authTokenService'), throttle: g('loginThrottle'),
      }),

      // domain services
      userService: () => new UserService({ users: g('repo.users'), penugasan: g('repo.penugasan'), passwords: g('passwordService') }),
      siswaService: () => new SiswaService({ siswa: g('repo.siswa'), peserta: g('repo.peserta'), passwords: g('passwordService') }),
      mapelService: () => new MasterDataService({ repo: g('repo.mapel'), prefix: 'mpl', label: 'Mata pelajaran', usageCheck: (id) => g('repo.penugasan').where((p) => p.mapelId === id).length > 0 }),
      jenisUjianService: () => new MasterDataService({ repo: g('repo.jenisUjian'), prefix: 'jns', label: 'Jenis ujian', usageCheck: (id) => g('repo.penugasan').where((p) => p.jenisUjianId === id).length > 0 }),
      penugasanService: () => new PenugasanService({
        penugasan: g('repo.penugasan'), users: g('repo.users'), mapel: g('repo.mapel'), jenis: g('repo.jenisUjian'), ujian: g('repo.ujian'),
      }),
      ujianService: () => new UjianService({
        ujian: g('repo.ujian'), penugasan: g('repo.penugasan'), soal: g('repo.soal'), peserta: g('repo.peserta'),
        sesi: g('repo.sesi'), users: g('repo.users'), mapel: g('repo.mapel'), jenis: g('repo.jenisUjian'),
      }),
      soalService: () => new SoalService({ soal: g('repo.soal'), ujian: g('repo.ujian'), sesi: g('repo.sesi') }),
      pesertaService: () => new PesertaService({ peserta: g('repo.peserta'), siswa: g('repo.siswa'), ujian: g('repo.ujian') }),
      gradingService: () => new GradingService({ soal: g('repo.soal'), jawaban: g('repo.jawaban'), sesi: g('repo.sesi') }),
      studentExamService: () => new StudentExamService({
        ujian: g('repo.ujian'), soal: g('repo.soal'), peserta: g('repo.peserta'), sesi: g('repo.sesi'),
        jawaban: g('repo.jawaban'), penugasan: g('repo.penugasan'), mapel: g('repo.mapel'), jenis: g('repo.jenisUjian'),
        users: g('repo.users'), grading: g('gradingService'),
      }),
      resultService: () => new ResultService({
        ujian: g('repo.ujian'), sesi: g('repo.sesi'), siswa: g('repo.siswa'), soal: g('repo.soal'),
        jawaban: g('repo.jawaban'), grading: g('gradingService'),
      }),
    };
  },
};
