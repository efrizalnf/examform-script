/** Aturan kepemilikan/otorisasi tingkat data (di luar pengecekan peran di router). */
const AccessPolicy = {
  assertCanManageUjian(principal, ujian) {
    if (!ujian) throw Errors.notFound('Ujian');
    if (principal.role === ROLE.ADMIN) return;
    if (principal.role === ROLE.GURU && ujian.guruId === principal.id) return;
    throw Errors.forbidden('Ujian ini bukan milik Anda.');
  },
};
