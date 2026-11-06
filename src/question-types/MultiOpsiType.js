/** Multi opsi (pilih lebih dari satu). kunci=["A","C"]. Benar bila himpunan jawaban persis sama. */
const MultiOpsiType = {
  type: 'multi',
  manual: false,

  normalize(input) {
    const opsi = QuestionHelpers.normalizeOptions(input.opsi, 2, 10);
    const kunci = Validate.array(input.kunci, 'Kunci jawaban', { min: 1, max: 10 }).map(String);
    const keys = opsi.map((o) => o.key);
    kunci.forEach((k) => { if (keys.indexOf(k) < 0) throw Errors.validation(`Kunci "${k}" tidak ada di daftar opsi.`); });
    return { opsi, kunci: kunci.filter((k, i) => kunci.indexOf(k) === i).sort() };
  },
  buildLayout(soal, shuffle) { return PilihanGandaType.buildLayout(soal, shuffle); },
  present(soal, layout) { return PilihanGandaType.present(soal, layout); },
  grade(soal, answer) {
    if (!Array.isArray(answer)) return { ratio: 0, manual: false };
    const given = answer.map(String).filter((k, i, a) => a.indexOf(k) === i).sort();
    const ok = given.length === soal.kunci.length && given.every((k, i) => k === soal.kunci[i]);
    return { ratio: ok ? 1 : 0, manual: false };
  },
};
