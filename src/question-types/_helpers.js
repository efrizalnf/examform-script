/** Helper bersama untuk tipe soal. */
const QuestionHelpers = {
  KEY_LETTERS: 'ABCDEFGHIJKL',

  /** Normalisasi daftar opsi bergaya pilihan ganda: [{key?, teks}] -> [{key, teks}] */
  normalizeOptions(raw, min, max) {
    const list = Validate.array(raw, 'Opsi', { min, max });
    const seen = {};
    return list.map((o, i) => {
      const item = typeof o === 'string' ? { teks: o } : Validate.object(o, 'Opsi');
      const key = Validate.string(item.key || QuestionHelpers.KEY_LETTERS.charAt(i), 'Kunci opsi', { max: 10 });
      if (seen[key]) throw Errors.validation(`Kunci opsi "${key}" duplikat.`);
      seen[key] = true;
      return { key, teks: Validate.string(item.teks, `Teks opsi ${key}`, { max: 1000 }) };
    });
  },

  normalizeText(s) {
    return String(s === undefined || s === null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  },

  /** Susun ulang opsi sesuai layout (urutan key). */
  orderByKeys(options, keys) {
    if (!keys) return options;
    const map = {}; options.forEach((o) => { map[o.key] = o; });
    return keys.map((k) => map[k]).filter(Boolean);
  },
};
