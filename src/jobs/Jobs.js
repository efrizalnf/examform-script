/** Handler trigger waktu: tutup sesi yang waktunya habis & tutup Google Form yang jadwalnya lewat. */
function finalizeExpiredSessionsJob() {
  try {
    const n = Container.get('studentExamService').finalizeExpired();
    if (n) Log.info('Sesi ditutup otomatis', { jumlah: n });
  } catch (e) {
    Log.error('finalizeExpiredSessionsJob gagal', e);
  }
  try {
    const f = Container.get('formDeployService').closeExpired();
    if (f) Log.info('Form ditutup otomatis', { jumlah: f });
  } catch (e) {
    Log.error('closeExpiredForms gagal', e);
  }
  try {
    // Sinkron hasil Google Form otomatis (inkremental) agar nilai sudah siap saat guru membukanya.
    const s = Container.get('formResultService').syncActive();
    if (s) Log.info('Sinkron Form otomatis', { ujian: s });
  } catch (e) {
    Log.error('syncActive gagal', e);
  }
}
