/** Menghitung nilai satu sesi. Idempotent: aman dipanggil ulang (mis. setelah guru menilai essay). */
class GradingService {
  constructor(deps) { Object.assign(this, deps); }

  /**
   * Murni (tanpa I/O): hitung nilai dari bank soal, daftar id soal sesi, jawaban, dan skor essay manual.
   * @param {Object} bank {soalId: soal}  @param {string[]} soalIds
   * @param {Object} answers {soalId: jawaban}  @param {Object} essayScores {soalId: skor}
   */
  compute(bank, soalIds, answers, essayScores) {
    let earned = 0, max = 0, pending = false;
    const detail = [];
    soalIds.forEach((soalId) => {
      const s = bank[soalId];
      if (!s) return;
      const handler = QuestionTypeRegistry.get(s.tipe);
      const given = answers[soalId] === undefined ? null : answers[soalId];
      let got = 0;
      if (handler.manual) {
        const manual = essayScores[soalId];
        const answered = given !== null && String(given).trim() !== '';
        if (manual !== null && manual !== undefined) got = Math.min(Math.max(manual, 0), s.bobot);
        else if (answered) pending = true;
      } else {
        got = handler.grade(s, given).ratio * s.bobot;
      }
      earned += got; max += s.bobot;
      detail.push({ soalId, skor: got, bobot: s.bobot });
    });
    const nilai = max > 0 ? Math.round((earned / max) * 10000) / 100 : 0;
    return { detail, skorPerolehan: Math.round(earned * 100) / 100, skorMaksimum: max, nilai, perluKoreksi: pending };
  }

  gradeSession(sesi) {
    const bank = {}; this.soal.findBy('ujianId', sesi.ujianId).forEach((s) => { bank[s.id] = s; });
    const bulk = sesi.jawabanForm || {};
    const answers = Object.assign({}, bulk);
    const essayScores = {};
    this.jawaban.findBy('sesiId', sesi.id).forEach((j) => {
      if (j.jawaban !== null && j.jawaban !== undefined) answers[j.soalId] = j.jawaban;
      if (j.skor !== null && j.skor !== undefined) essayScores[j.soalId] = j.skor;
    });
    const r = this.compute(bank, (sesi.layout && sesi.layout.soal) || [], answers, essayScores);
    const patch = { skorPerolehan: r.skorPerolehan, skorMaksimum: r.skorMaksimum, nilai: r.nilai, perluKoreksi: r.perluKoreksi };
    this.sesi.update(sesi.id, patch);
    return Object.assign({ detail: r.detail }, patch);
  }
}
