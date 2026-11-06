/** Pilihan ganda: tepat satu jawaban benar. opsi=[{key,teks}], kunci="A". */
const PilihanGandaType = {
  type: 'pg',
  manual: false,

  normalize(input) {
    const opsi = QuestionHelpers.normalizeOptions(input.opsi, 2, 10);
    const kunci = Validate.string(input.kunci, 'Kunci jawaban', { max: 10 });
    if (!opsi.some((o) => o.key === kunci)) throw Errors.validation('Kunci jawaban tidak ada di daftar opsi.');
    return { opsi, kunci };
  },
  buildLayout(soal, shuffle) {
    const keys = soal.opsi.map((o) => o.key);
    return { opsi: shuffle ? Shuffle.array(keys) : keys };
  },
  present(soal, layout) {
    return { opsi: QuestionHelpers.orderByKeys(soal.opsi, layout && layout.opsi) };
  },
  /** Google Form: 1 item pilihan ganda. Kunci TIDAK dikirim ke Form (penilaian dilakukan di server). */
  toFormItems(soal) {
    return [{ sub: 'main', kind: 'choice', title: soal.teks, choices: soal.opsi.map((o) => o.teks) }];
  },
  fromFormAnswers(soal, r) {
    const o = QuestionHelpers.matchOption(soal.opsi, r.main);
    return o ? o.key : null;
  },
  grade(soal, answer) {
    return { ratio: answer !== undefined && answer !== null && String(answer) === String(soal.kunci) ? 1 : 0, manual: false };
  },
};
