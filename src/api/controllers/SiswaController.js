/** API untuk aplikasi Android siswa. Kunci jawaban tidak pernah dikirim ke sini. */
const SiswaController = {
  routes() {
    const S = [ROLE.SISWA];
    const svc = () => Container.get('studentExamService');
    return {
      'siswa.ujian.list': { roles: S, handle: (x) => svc().listAvailable(x.principal.id) },
      'siswa.ujian.start': { roles: S, handle: (x, d) => svc().start(x.principal.id, d) },
      'siswa.sesi.get': { roles: S, handle: (x, d) => svc().getSession(x.principal.id, d.sesiId) },
      'siswa.jawaban.save': { roles: S, handle: (x, d) => svc().saveAnswers(x.principal.id, d) },
      'siswa.sesi.finish': { roles: S, handle: (x, d) => svc().finish(x.principal.id, d) },
    };
  },
};
