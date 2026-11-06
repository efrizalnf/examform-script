/** Isian singkat. kunci=["jawaban 1","alternatif"]; pencocokan tanpa memperhatikan huruf besar/kecil & spasi ganda. */
const IsianSingkatType = {
  type: 'isian',
  manual: false,

  normalize(input) {
    const kunci = Validate.array(input.kunci, 'Kunci jawaban', { min: 1, max: 20 })
      .map((k) => Validate.string(k, 'Kunci jawaban', { max: 300 }));
    return { opsi: null, kunci };
  },
  buildLayout() { return {}; },
  present() { return {}; },
  toFormItems(soal) { return [{ sub: 'main', kind: 'text', title: soal.teks }]; },
  fromFormAnswers(soal, r) { return r.main === undefined || r.main === null ? null : String(r.main); },
  grade(soal, answer) {
    const a = QuestionHelpers.normalizeText(answer);
    const ok = a !== '' && soal.kunci.some((k) => QuestionHelpers.normalizeText(k) === a);
    return { ratio: ok ? 1 : 0, manual: false };
  },
};
