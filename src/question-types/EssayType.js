/** Essay: dinilai manual oleh guru. kunci = rubrik/pedoman (opsional, tidak pernah dikirim ke siswa). */
const EssayType = {
  type: 'essay',
  manual: true,

  normalize(input) {
    return { opsi: null, kunci: input.kunci ? Validate.string(input.kunci, 'Rubrik', { max: 2000, required: false }) : '' };
  },
  buildLayout() { return {}; },
  present() { return {}; },
  grade() { return { ratio: 0, manual: true }; },
};
