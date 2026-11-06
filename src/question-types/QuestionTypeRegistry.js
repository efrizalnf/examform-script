/**
 * Registry tipe soal (Strategy pattern).
 * Menambah tipe baru: buat file `XxxType.js` dengan antarmuka
 *   { type, manual, normalize(input), buildLayout(soal, shuffle), present(soal, layout), grade(soal, answer) }
 * lalu daftarkan di `all()` di bawah. Tidak ada kode lain yang perlu diubah.
 */
const QuestionTypeRegistry = {
  all() {
    return [PilihanGandaType, MultiOpsiType, IsianSingkatType, EssayType, MenjodohkanType];
  },
  types() { return this.all().map((t) => t.type); },
  get(type) {
    const h = this.all().find((t) => t.type === type);
    if (!h) throw Errors.validation(`Tipe soal tidak dikenal: ${type}. Pilihan: ${this.types().join(', ')}.`);
    return h;
  },
};
