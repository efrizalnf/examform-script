/** Hasil ujian untuk guru/admin + penilaian manual essay. */
class ResultService {
  constructor(deps) { Object.assign(this, deps); }

  _ujian(principal, ujianId) {
    const u = this.ujian.findById(ujianId);
    AccessPolicy.assertCanManageUjian(principal, u);
    return u;
  }

  listByUjian(principal, ujianId) {
    this._ujian(principal, ujianId);
    const siswa = {}; this.siswa.findAll().forEach((s) => { siswa[s.nis] = s; });
    return this.sesi.findBy('ujianId', ujianId).map((s) => {
      const sw = siswa[s.nis] || {};
      return {
        sesiId: s.id, nis: s.nis, nama: sw.nama || '-', kelas: sw.kelas || '-', status: s.status,
        mulai: s.mulai, selesai: s.selesai, nilai: s.status === SESSION_STATUS.SELESAI ? s.nilai : null,
        perluKoreksi: s.perluKoreksi,
      };
    }).sort((a, b) => String(a.kelas + a.nama).localeCompare(b.kelas + b.nama));
  }

  detail(principal, sesiId) {
    const s = this.sesi.findById(sesiId);
    if (!s) throw Errors.notFound('Sesi');
    this._ujian(principal, s.ujianId);
    const bank = {}; this.soal.findBy('ujianId', s.ujianId).forEach((q) => { bank[q.id] = q; });
    const ans = {}; this.jawaban.findBy('sesiId', sesiId).forEach((j) => { ans[j.soalId] = j; });
    return {
      sesi: s,
      soal: (s.layout.soal || []).map((id, i) => {
        const q = bank[id]; if (!q) return null;
        const h = QuestionTypeRegistry.get(q.tipe); const a = ans[id];
        const manual = h.manual;
        return {
          nomor: i + 1, soalId: id, tipe: q.tipe, teks: q.teks, opsi: q.opsi, kunci: q.kunci, bobot: q.bobot,
          jawaban: a ? a.jawaban : null, manual,
          skor: manual ? (a && a.skor !== null ? a.skor : null) : h.grade(q, a ? a.jawaban : null).ratio * q.bobot,
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
