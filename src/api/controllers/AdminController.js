const AdminController = {
  routes() {
    const A = [ROLE.ADMIN];
    const c = (n) => Container.get(n);
    return {
      // guru
      'admin.guru.list': { roles: A, handle: () => c('userService').listGuru() },
      'admin.guru.save': { roles: A, handle: (x, d) => c('userService').saveGuru(d) },
      'admin.guru.remove': { roles: A, handle: (x, d) => c('userService').removeGuru(d.id) },
      'admin.guru.resetPassword': { roles: A, handle: (x, d) => c('userService').resetPassword(d.id) },
      // siswa
      'admin.siswa.list': { roles: A, handle: (x, d) => c('siswaService').list(d) },
      'admin.siswa.save': { roles: A, handle: (x, d) => c('siswaService').save(d) },
      'admin.siswa.remove': { roles: A, handle: (x, d) => c('siswaService').remove(d.nis) },
      'admin.siswa.import': { roles: A, handle: (x, d) => c('siswaService').importMany(d.siswa) },
      'admin.siswa.generatePasswords': { roles: A, handle: (x, d) => c('siswaService').generatePasswords(d) },
      // master
      'admin.mapel.list': { roles: A, handle: () => c('mapelService').list() },
      'admin.mapel.save': { roles: A, handle: (x, d) => c('mapelService').save(d) },
      'admin.mapel.remove': { roles: A, handle: (x, d) => c('mapelService').remove(d.id) },
      'admin.jenisUjian.list': { roles: A, handle: () => c('jenisUjianService').list() },
      'admin.jenisUjian.save': { roles: A, handle: (x, d) => c('jenisUjianService').save(d) },
      'admin.jenisUjian.remove': { roles: A, handle: (x, d) => c('jenisUjianService').remove(d.id) },
      // penugasan guru (mapel + jenis ujian + waktu ujian)
      'admin.penugasan.list': { roles: A, handle: (x, d) => c('penugasanService').adminList(d.guruId) },
      'admin.penugasan.save': { roles: A, handle: (x, d) => c('penugasanService').adminSave(d) },
      'admin.penugasan.remove': { roles: A, handle: (x, d) => c('penugasanService').adminRemove(d.id) },
      // ujian aktif
      'admin.ujian.setAktif': { roles: A, handle: (x, d) => c('ujianService').adminSetAktif(d.id, d.aktif) },
    };
  },
};
