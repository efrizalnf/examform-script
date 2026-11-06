class SoalService {
  constructor(deps) { Object.assign(this, deps); }

  _ujianFor(principal, ujianId) {
    const u = this.ujian.findById(ujianId);
    AccessPolicy.assertCanManageUjian(principal, u);
    return u;
  }

  tipeTersedia() { return QuestionTypeRegistry.types(); }

  list(principal, ujianId) {
    this._ujianFor(principal, ujianId);
    return this.soal.where((s) => s.ujianId === ujianId).sort((a, b) => a.urutan - b.urutan);
  }

  _assertEditable(ujianId) {
    if (this.sesi.findBy('ujianId', ujianId).length) {
      throw Errors.rule('UJIAN_SUDAH_DIKERJAKAN', 'Ujian sudah dikerjakan siswa; soal tidak dapat diubah atau dihapus.');
    }
  }

  save(principal, input) {
    Validate.object(input, 'Data soal');
    this._ujianFor(principal, input.ujianId);
    const handler = QuestionTypeRegistry.get(input.tipe);
    const teks = Validate.string(input.teks, 'Teks soal', { max: 5000 });
    const bobot = Validate.number(input.bobot === undefined ? 1 : input.bobot, 'Bobot', { min: 0, max: 1000 });
    const norm = handler.normalize(input);
    this._assertEditable(input.ujianId);

    if (input.id) {
      const cur = this.soal.findById(input.id);
      if (!cur || cur.ujianId !== input.ujianId) throw Errors.notFound('Soal');
      const patch = { tipe: handler.type, teks, bobot, opsi: norm.opsi, kunci: norm.kunci };
      if (input.urutan !== undefined) patch.urutan = Validate.int(input.urutan, 'Urutan', { min: 1 });
      return this.soal.update(cur.id, patch);
    }
    const existing = this.soal.where((s) => s.ujianId === input.ujianId);
    const urutan = existing.reduce((m, s) => Math.max(m, s.urutan || 0), 0) + 1;
    const row = {
      id: Ids.next('soal'), ujianId: input.ujianId, tipe: handler.type, teks, opsi: norm.opsi,
      kunci: norm.kunci, bobot, urutan, aktif: true, dibuatPada: Clock.iso(),
    };
    return this.soal.insert(row);
  }

  /** Admin atau guru pemilik mengaktifkan/menonaktifkan soal. */
  setAktif(principal, id, aktif) {
    const s = this.soal.findById(id);
    if (!s) throw Errors.notFound('Soal');
    this._ujianFor(principal, s.ujianId);
    this.soal.update(id, { aktif: Validate.bool(aktif) });
    return { id, aktif: Validate.bool(aktif) };
  }

  remove(principal, id) {
    const s = this.soal.findById(id);
    if (!s) throw Errors.notFound('Soal');
    this._ujianFor(principal, s.ujianId);
    this._assertEditable(s.ujianId);
    this.soal.delete(id);
    return { deleted: true };
  }
}
