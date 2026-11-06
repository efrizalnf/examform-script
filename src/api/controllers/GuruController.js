const GuruController = {
  routes() {
    const G = [ROLE.GURU];
    const c = (n) => Container.get(n);
    return {
      'guru.penugasan.list': { roles: G, handle: (x) => c('penugasanService').guruList(x.principal.id) },
      'guru.penugasan.setAktif': { roles: G, handle: (x, d) => c('penugasanService').guruSetAktif(x.principal.id, d.id, d.aktif) },
      'guru.ujian.save': { roles: G, handle: (x, d) => c('ujianService').guruSave(x.principal.id, d) },
      'guru.ujian.remove': { roles: G, handle: (x, d) => c('ujianService').guruRemove(x.principal.id, d.id) },
      'guru.soal.save': { roles: G, handle: (x, d) => c('soalService').save(x.principal, d) },
      'guru.soal.remove': { roles: G, handle: (x, d) => c('soalService').remove(x.principal, d.id) },
      'guru.peserta.get': { roles: G, handle: (x, d) => c('pesertaService').get(x.principal, d.ujianId) },
      'guru.peserta.set': { roles: G, handle: (x, d) => c('pesertaService').set(x.principal, d.ujianId, d.nisList) },
    };
  },
};
