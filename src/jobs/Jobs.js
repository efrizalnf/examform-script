/** Handler trigger waktu: menutup sesi yang waktunya habis (siswa yang menutup aplikasi). */
function finalizeExpiredSessionsJob() {
  try {
    const n = Container.get('studentExamService').finalizeExpired();
    if (n) Log.info('Sesi ditutup otomatis', { jumlah: n });
  } catch (e) {
    Log.error('finalizeExpiredSessionsJob gagal', e);
  }
}
