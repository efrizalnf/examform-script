/** Hasil ujian untuk guru/admin + penilaian manual essay. */
class ResultService {
  constructor(deps) { Object.assign(this, deps); }

  _ujian(principal, ujianId) {
    const u = this.ujian.findById(ujianId);
    AccessPolicy.assertCanManageUjian(principal, u);
    return u;
  }

  listByUjian(principal, ujianId) {
    const u = this._ujian(principal, ujianId);
    const siswa = {}; this.siswa.findAll().forEach((s) => { siswa[s.nis] = s; });
    const rows = this.sesi.findBy('ujianId', ujianId).map((s) => {
      const sw = siswa[s.nis] || {};
      // mode Google Form: nilai baru ada setelah respons disinkronkan
      const menungguSinkron = !!u.formId && !s.formResponseId;
      return {
        sesiId: s.id, nis: s.nis, nama: sw.nama || '-', kelas: sw.kelas || '-', jenjang: Jenjang.normalize(sw.jenjang) || sw.jenjang || '-', status: s.status,
        mulai: s.mulai, selesai: s.selesai,
        nilai: s.status === SESSION_STATUS.SELESAI && !menungguSinkron ? s.nilai : null,
        perluKoreksi: s.perluKoreksi, terlambat: !!s.terlambat, menungguSinkron,
      };
    });
    // peserta yang belum membuka ujian ikut ditampilkan (status "belum") agar filter kelas/jenjang lengkap
    const started = {}; rows.forEach((r) => { started[r.nis] = true; });
    this.peserta.findBy('ujianId', ujianId).forEach((p) => {
      if (started[p.nis]) return;
      const sw = siswa[p.nis] || {};
      rows.push({
        sesiId: null, nis: p.nis, nama: sw.nama || '-', kelas: sw.kelas || '-', jenjang: Jenjang.normalize(sw.jenjang) || sw.jenjang || '-', status: 'belum',
        mulai: '', selesai: '', nilai: null, perluKoreksi: false, terlambat: false, menungguSinkron: false,
      });
    });
    return rows.sort((a, b) => String(a.kelas + a.nama).localeCompare(b.kelas + b.nama));
  }

  detail(principal, sesiId) {
    const s = this.sesi.findById(sesiId);
    if (!s) throw Errors.notFound('Sesi');
    this._ujian(principal, s.ujianId);
    const bank = {}; this.soal.findBy('ujianId', s.ujianId).forEach((q) => { bank[q.id] = q; });
    const rows = {}; this.jawaban.findBy('sesiId', sesiId).forEach((j) => { rows[j.soalId] = j; });
    const bulk = s.jawabanForm || {};
    return {
      sesi: s,
      soal: ((s.layout && s.layout.soal) || []).map((id, i) => {
        const q = bank[id]; if (!q) return null;
        const h = QuestionTypeRegistry.get(q.tipe); const a = rows[id];
        const given = a && a.jawaban !== null && a.jawaban !== undefined ? a.jawaban : (bulk[id] === undefined ? null : bulk[id]);
        const manual = h.manual;
        return {
          nomor: i + 1, soalId: id, tipe: q.tipe, teks: q.teks, opsi: q.opsi, kunci: q.kunci, bobot: q.bobot,
          jawaban: given, manual,
          skor: manual ? (a && a.skor !== null && a.skor !== undefined ? a.skor : null) : h.grade(q, given).ratio * q.bobot,
        };
      }).filter(Boolean),
    };
  }

  /** Guru memberi nilai essay (0..bobot) lalu nilai akhir dihitung ulang. */
  scoreEssay(principal, input) {
    Validate.object(input, 'Data');
    const s = this.sesi.findById(input.sesiId);
    if (!s) throw Errors.notFound('Sesi');
    this._ujian(principal, s.ujianId);
    if (s.status !== SESSION_STATUS.SELESAI) throw Errors.rule('SESI_BELUM_SELESAI', 'Siswa belum selesai mengerjakan.');
    const q = this.soal.findById(input.soalId);
    if (!q || !QuestionTypeRegistry.get(q.tipe).manual) throw Errors.validation('Soal ini tidak dinilai manual.');
    const skor = Validate.number(input.skor, 'Skor', { min: 0, max: q.bobot });
    this.jawaban.upsert({ id: `${s.id}:${q.id}`, sesiId: s.id, soalId: q.id, skor, diubahPada: Clock.iso() });
    const graded = this.grading.gradeSession(s);
    return { nilai: graded.nilai, perluKoreksi: graded.perluKoreksi };
  }
}
