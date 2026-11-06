/**
 * Menjodohkan. opsi={kiri:[{id,teks}], kanan:[{id,teks}]}, kunci={idKiri:idKanan}.
 * Kolom kanan boleh memiliki pengecoh. Nilai parsial: proporsi pasangan yang benar.
 */
const MenjodohkanType = {
  type: 'jodoh',
  manual: false,

  _items(list, prefix, name) {
    const arr = Validate.array(list, name, { min: 1, max: 20 });
    const seen = {};
    return arr.map((it, i) => {
      const o = typeof it === 'string' ? { teks: it } : Validate.object(it, name);
      const id = Validate.string(o.id || `${prefix}${i + 1}`, `ID ${name}`, { max: 20 });
      if (seen[id]) throw Errors.validation(`ID ${name} "${id}" duplikat.`);
      seen[id] = true;
      return { id, teks: Validate.string(o.teks, `Teks ${name}`, { max: 500 }) };
    });
  },

  normalize(input) {
    const raw = Validate.object(input.opsi, 'Opsi menjodohkan');
    const kiri = this._items(raw.kiri, 'L', 'kolom kiri');
    const kanan = this._items(raw.kanan, 'R', 'kolom kanan');
    if (kanan.length < kiri.length) throw Errors.validation('Kolom kanan minimal sama banyak dengan kolom kiri.');
    const kunci = Validate.object(input.kunci, 'Kunci menjodohkan');
    const rightIds = kanan.map((r) => r.id);
    const cleaned = {};
    kiri.forEach((l) => {
      const r = kunci[l.id];
      if (!r) throw Errors.validation(`Pasangan untuk "${l.teks}" belum ditentukan.`);
      if (rightIds.indexOf(r) < 0) throw Errors.validation(`Pasangan "${r}" tidak ada di kolom kanan.`);
      cleaned[l.id] = String(r);
    });
    return { opsi: { kiri, kanan }, kunci: cleaned };
  },
  buildLayout(soal, shuffle) {
    const ids = soal.opsi.kanan.map((r) => r.id);
    return { kanan: shuffle ? Shuffle.array(ids) : ids };
  },
  present(soal, layout) {
    return { pasangan: { kiri: soal.opsi.kiri, kanan: QuestionHelpers.orderByKeys(
      soal.opsi.kanan.map((r) => ({ key: r.id, teks: r.teks })), layout && layout.kanan).map((r) => ({ id: r.key, teks: r.teks })) } };
  },
  grade(soal, answer) {
    if (!answer || typeof answer !== 'object') return { ratio: 0, manual: false };
    const ids = Object.keys(soal.kunci);
    const correct = ids.filter((l) => String(answer[l]) === String(soal.kunci[l])).length;
    return { ratio: ids.length ? correct / ids.length : 0, manual: false };
  },
};
