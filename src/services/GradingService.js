/** Menghitung nilai satu sesi. Idempotent: aman dipanggil ulang (mis. setelah guru menilai essay). */
class GradingService {
  constructor(deps) { Object.assign(this, deps); }

  gradeSession(sesi) {
    const bank = {}; this.soal.findBy('ujianId', sesi.ujianId).forEach((s) => { bank[s.id] = s; });
    const answers = {}; this.jawaban.findBy('sesiId', sesi.id).forEach((j) => { answers[j.soalId] = j; });

    let earned = 0, max = 0, pending = false;
    const detail = [];
    (sesi.layout && sesi.layout.soal || []).forEach((soalId) => {
      const s = bank[soalId];
      if (!s) return;
      const handler = QuestionTypeRegistry.get(s.tipe);
      const ans = answers[soalId];
      const given = ans ? ans.jawaban : null;
      let got = 0;
      if (handler.manual) {
        const answered = given !== null && String(given).trim() !== '';
        if (ans && ans.skor !== null && ans.skor !== undefined) got = Math.min(Math.max(ans.skor, 0), s.bobot);
        else if (answered) pending = true;
      } else {
        got = handler.grade(s, given).ratio * s.bobot;
      }
      earned += got; max += s.bobot;
      detail.push({ soalId, skor: got, bobot: s.bobot });
    });
    const nilai = max > 0 ? Math.round((earned / max) * 10000) / 100 : 0;
    const patch = { skorPerolehan: Math.round(earned * 100) / 100, skorMaksimum: max, nilai, perluKoreksi: pending };
    this.sesi.update(sesi.id, patch);
    return Object.assign({ detail }, patch);
  }
}
