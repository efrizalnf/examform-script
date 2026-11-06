/**
 * Menarik respons Google Form -> jawaban CBT -> nilai. Inkremental: respons yang sudah
 * disinkronkan (formResponseId sama) dilewati, sehingga aman dan cepat dipanggil berulang.
 */
class FormResultService {
  constructor(deps) { Object.assign(this, deps); }

  sync(principal, ujianId) {
    const u = this.ujian.findById(ujianId);
    AccessPolicy.assertCanManageUjian(principal, u);
    if (!u.formId) throw Errors.rule('BELUM_DEPLOY', 'Ujian ini belum dipublikasikan ke Google Form.');
    if (!Mutex.tryAcquire(`sync:${ujianId}`, 120)) throw Errors.rule('BUSY', 'Sinkronisasi sedang berjalan.');
    try { return this._sync(u); } finally { Mutex.release(`sync:${ujianId}`); }
  }

  _sync(u) {
    const soalList = this.soal.where((s) => s.ujianId === u.id && s.aktif);
    const bank = {}; this.soal.findBy('ujianId', u.id).forEach((s) => { bank[s.id] = s; });
    const sesiByNis = {}; this.sesi.findBy('ujianId', u.id).forEach((s) => { sesiByNis[s.nis] = s; });

    // satu respons per NIS: yang paling awal
    const byNis = {}; let ganda = 0, tanpaNis = 0;
    this.forms.readResponses(u.formId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .forEach((r) => {
        const nis = String(r.answers[u.formNisItemId] || '').trim();
        if (!nis) { tanpaNis++; return; }
        if (byNis[nis]) { ganda++; return; }
        byNis[nis] = r;
      });

    const patches = {}; const out = { disinkronkan: 0, dilewati: 0, tanpaSesi: [], ganda, tanpaNis, terlambat: 0, perluKoreksi: 0 };
    Object.keys(byNis).forEach((nis) => {
      const r = byNis[nis];
      const sesi = sesiByNis[nis];
      if (!sesi) { out.tanpaSesi.push(nis); return; }
      if (sesi.formResponseId === r.id) { out.dilewati++; return; }

      const answers = FormPlanService.readAnswers(soalList, r.answers);
      const grade = this.grading.compute(bank, (sesi.layout && sesi.layout.soal) || [], answers, {});
      const late = new Date(r.timestamp).getTime() > new Date(sesi.batas).getTime() + FORM.LATE_GRACE_SECONDS * 1000;
      patches[sesi.id] = {
        status: SESSION_STATUS.SELESAI, selesai: sesi.selesai || r.timestamp,
        jawabanForm: answers, formResponseId: r.id, terlambat: late,
        skorPerolehan: grade.skorPerolehan, skorMaksimum: grade.skorMaksimum, nilai: grade.nilai, perluKoreksi: grade.perluKoreksi,
      };
      out.disinkronkan++;
      if (late) out.terlambat++;
      if (grade.perluKoreksi) out.perluKoreksi++;
    });
    this.sesi.updateMany(patches);
    out.belumMengumpulkan = Object.keys(sesiByNis).filter((n) => !byNis[n]).length;
    return out;
  }
}
