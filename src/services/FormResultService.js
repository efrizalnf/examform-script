/**
 * Menarik respons Google Form -> jawaban CBT -> nilai. Inkremental: respons yang sudah
 * disinkronkan (formResponseId sama) dilewati, sehingga aman dan cepat dipanggil berulang.
 */
class FormResultService {
  constructor(deps) { Object.assign(this, deps); }

  /** opts.penuh = baca ulang SEMUA respons (default: hanya yang baru sejak sinkron terakhir). */
  sync(principal, ujianId, opts) {
    const u = this.ujian.findById(ujianId);
    AccessPolicy.assertCanManageUjian(principal, u);
    if (!u.formId) throw Errors.rule('BELUM_DEPLOY', 'Ujian ini belum dipublikasikan ke Google Form.');
    if (!Mutex.tryAcquire(`sync:${ujianId}`, 120)) throw Errors.rule('BUSY', 'Sinkronisasi sedang berjalan.');
    try { return this._sync(u, opts || {}); } finally { Mutex.release(`sync:${ujianId}`); }
  }

  /** Dipanggil trigger waktu: menyinkronkan ujian aktif ber-Form agar klik manual hampir tanpa pekerjaan. */
  syncActive(budgetMs) {
    const started = Date.now(); let n = 0;
    this.ujian.where((u) => u.aktif && u.formId).forEach((u) => {
      if (Date.now() - started > (budgetMs || 150000)) return;
      if (!Mutex.tryAcquire(`sync:${u.id}`, 120)) return;
      try { this._sync(u, {}); n++; } catch (e) { Log.error('Sinkron otomatis gagal', e, { ujianId: u.id }); } finally { Mutex.release(`sync:${u.id}`); }
    });
    return n;
  }

  _sync(u, opts) {
    const soalList = this.soal.findBy('ujianId', u.id).filter((s) => s.aktif);
    const bank = {}; this.soal.findBy('ujianId', u.id).forEach((s) => { bank[s.id] = s; });
    const sesiByNis = {}; this.sesi.findBy('ujianId', u.id).forEach((s) => { sesiByNis[s.nis] = s; });

    // Inkremental: hanya respons baru sejak sinkron terakhir (kecuali opts.penuh).
    const raw = this.forms.readResponses(u.formId, opts.penuh ? null : (u.formSyncedAt || null));
    let maxTs = '';

    // satu respons per NIS: yang paling awal
    const byNis = {}; let ganda = 0, tanpaNis = 0;
    raw.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).forEach((r) => {
      if (r.timestamp > maxTs) maxTs = r.timestamp;
      const nis = String(r.answers[u.formNisItemId] || '').trim();
      if (!nis) { tanpaNis++; return; }
      if (byNis[nis]) { ganda++; return; }
      byNis[nis] = r;
    });

    const patches = {}; const out = { disinkronkan: 0, dilewati: 0, tanpaSesi: [], ganda, tanpaNis, terlambat: 0, perluKoreksi: 0, baru: raw.length };
    Object.keys(byNis).forEach((nis) => {
      const r = byNis[nis];
      const sesi = sesiByNis[nis];
      if (!sesi) { out.tanpaSesi.push(nis); return; }
      // Sesi sudah punya respons yang dipakai: sama = sudah ada; beda = kiriman ganda (yang pertama dipakai).
      if (sesi.formResponseId) { if (sesi.formResponseId === r.id) out.dilewati++; else out.ganda++; return; }

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
    if (Object.keys(patches).length) this.sesi.updateMany(patches);
    if (maxTs && maxTs !== u.formSyncedAt) this.ujian.update(u.id, { formSyncedAt: maxTs });
    out.belumMengumpulkan = Object.keys(sesiByNis).filter((n) => !sesiByNis[n].formResponseId && !patches[sesiByNis[n].id]).length;
    return out;
  }
}
