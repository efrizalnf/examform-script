/** Mempublikasikan soal sebuah ujian menjadi Google Form, dan menutup form yang jadwalnya habis. */
class FormDeployService {
  constructor(deps) { Object.assign(this, deps); }

  _activeSoal(ujianId) {
    return this.soal.findBy('ujianId', ujianId).filter((s) => s.aktif).sort((a, b) => a.urutan - b.urutan);
  }

  /** Deploy pertama = buat form baru; deploy ulang = bangun ulang isi form yang sama (link tetap). */
  deploy(principal, ujianId) {
    const u = this.ujian.findById(ujianId);
    AccessPolicy.assertCanManageUjian(principal, u);
    if (this.sesi.findBy('ujianId', ujianId).length) {
      throw Errors.rule('UJIAN_SUDAH_DIKERJAKAN', 'Ujian sudah dikerjakan siswa; form tidak dapat dibangun ulang.');
    }
    const soalList = this._activeSoal(ujianId);
    if (!soalList.length) throw Errors.rule('TIDAK_ADA_SOAL', 'Ujian belum memiliki soal aktif.');
    const plan = FormPlanService.build(soalList);

    let r;
    try {
      r = this.forms.deploy({
        title: u.judul, description: u.deskripsi, shuffle: u.acakSoal, accepting: u.aktif,
        plan, existingFormId: u.formId || null,
      });
    } catch (e) {
      // Tampilkan penyebab asli ke admin/guru (bukan "kesalahan pada server" yang generik).
      Log.error('Deploy Google Form gagal', e, { ujianId });
      const raw = String((e && e.message) || e);
      const izin = /permission|authori[sz]|izin|forms\.currentonly|script\.forms|auth\/forms/i.test(raw);
      throw Errors.rule('FORM_GAGAL', 'Gagal membuat Google Form: ' + raw.slice(0, 300) +
        (izin ? ' — Jalankan fungsi "setup" sekali dari editor Apps Script untuk menyetujui izin Google Forms, lalu buat versi deployment baru.' : ''));
    }

    const map = FormPlanService.itemMap(plan, r.itemIds);
    this.soal.updateMany(Object.keys(map).reduce((acc, id) => { acc[id] = { formItems: map[id] }; return acc; }, {}));
    this.ujian.update(u.id, {
      formId: r.formId, formUrl: r.formUrl, formEditUrl: r.formEditUrl,
      formNisItemId: r.nisItemId, formNamaItemId: r.namaItemId,
      formDeployedAt: Clock.iso(), formAccepting: !!u.aktif, formStale: false, formSyncedAt: '',
    });
    return { formId: r.formId, formUrl: r.formUrl, formEditUrl: r.formEditUrl, jumlahItem: plan.length, baru: !u.formId };
  }

  /** Tutup form yang jadwal tutupnya sudah lewat (dipanggil trigger waktu). */
  closeExpired() {
    const limit = Clock.nowMs() - FORM.CLOSE_GRACE_SECONDS * 1000;
    let n = 0;
    this.ujian.where((u) => u.formId && u.formAccepting && u.selesai && new Date(u.selesai).getTime() < limit).forEach((u) => {
      try {
        this.forms.setAccepting(u.formId, false);
        this.ujian.update(u.id, { formAccepting: false });
        n++;
      } catch (e) { Log.error('Gagal menutup form', e, { ujianId: u.id }); }
    });
    return n;
  }
}
