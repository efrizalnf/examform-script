/** Rute yang dipakai admin dan guru (data otomatis dibatasi sesuai kepemilikan). */
const SharedController = {
  routes() {
    const AG = [ROLE.ADMIN, ROLE.GURU];
    const c = (n) => Container.get(n);
    return {
      'meta.options': { roles: AG, handle: () => ({ tipeSoal: QuestionTypeRegistry.types() }) },
      'ujian.list': { roles: AG, handle: (x) => c('ujianService').list(x.principal) },
      'ujian.generateToken': { roles: AG, handle: (x, d) => c('ujianService').generateToken(x.principal, d.id) },
      'soal.list': { roles: AG, handle: (x, d) => c('soalService').list(x.principal, d.ujianId) },
      'soal.setAktif': { roles: AG, handle: (x, d) => c('soalService').setAktif(x.principal, d.id, d.aktif) },
      'hasil.list': { roles: AG, handle: (x, d) => c('resultService').listByUjian(x.principal, d.ujianId) },
      'hasil.detail': { roles: AG, handle: (x, d) => c('resultService').detail(x.principal, d.sesiId) },
      'hasil.nilaiEssay': { roles: AG, handle: (x, d) => c('resultService').scoreEssay(x.principal, d) },
    };
  },
};
