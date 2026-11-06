/** Rute yang dipakai admin dan guru (data otomatis dibatasi sesuai kepemilikan). Rute guru.* & admin.ujian.setAktif tetap ada demi kompatibilitas. */
const SharedController = {
  routes() {
    const AG = [ROLE.ADMIN, ROLE.GURU];
    const c = (n) => Container.get(n);
    return {
      'meta.options': { roles: AG, handle: () => ({ tipeSoal: QuestionTypeRegistry.types() }) },
      'ujian.list': { roles: AG, handle: (x) => c('ujianService').list(x.principal) },
      // admin & guru: kelola ujian, soal, peserta (data dibatasi kepemilikan lewat AccessPolicy)
      'ujian.save': { roles: AG, handle: (x, d) => c('ujianService').save(x.principal, d) },
      'ujian.remove': { roles: AG, handle: (x, d) => c('ujianService').remove(x.principal, d.id) },
      'ujian.setAktif': { roles: AG, handle: (x, d) => c('ujianService').setAktif(x.principal, d.id, d.aktif) },
      'ujian.deployForm': { roles: AG, handle: (x, d) => c('formDeployService').deploy(x.principal, d.id) },
      'soal.save': { roles: AG, handle: (x, d) => c('soalService').save(x.principal, d) },
      'soal.remove': { roles: AG, handle: (x, d) => c('soalService').remove(x.principal, d.id) },
      'peserta.get': { roles: AG, handle: (x, d) => c('pesertaService').get(x.principal, d.ujianId) },
      'peserta.set': { roles: AG, handle: (x, d) => c('pesertaService').set(x.principal, d.ujianId, d.nisList) },
      'hasil.syncForm': { roles: AG, handle: (x, d) => c('formResultService').sync(x.principal, d.ujianId) },
      'ujian.generateKodeKeluar': { roles: AG, handle: (x, d) => c('ujianService').generateKodeKeluar(x.principal, d.id) },
      'ujian.generateToken': { roles: AG, handle: (x, d) => c('ujianService').generateToken(x.principal, d.id) },
      'soal.list': { roles: AG, handle: (x, d) => c('soalService').list(x.principal, d.ujianId) },
      'soal.setAktif': { roles: AG, handle: (x, d) => c('soalService').setAktif(x.principal, d.id, d.aktif) },
      'hasil.list': { roles: AG, handle: (x, d) => c('resultService').listByUjian(x.principal, d.ujianId) },
      'hasil.detail': { roles: AG, handle: (x, d) => c('resultService').detail(x.principal, d.sesiId) },
      'hasil.nilaiEssay': { roles: AG, handle: (x, d) => c('resultService').scoreEssay(x.principal, d) },
    };
  },
};
