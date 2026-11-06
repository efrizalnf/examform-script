/** Penugasan guru: mapel + jenis ujian + waktu ujian default (admin); status aktif diatur guru. */
class PenugasanService {
  constructor(deps) { Object.assign(this, deps); }

  _enrich(list) {
    const guru = {}; this.users.findAll().forEach((u) => { guru[u.id] = u.nama; });
    const mapel = {}; this.mapel.findAll().forEach((m) => { mapel[m.id] = m.nama; });
    const jenis = {}; this.jenis.findAll().forEach((j) => { jenis[j.id] = j.nama; });
    return list.map((p) => ({
      id: p.id, guruId: p.guruId, guruNama: guru[p.guruId] || '-',
      mapelId: p.mapelId, mapelNama: mapel[p.mapelId] || '-',
      jenisUjianId: p.jenisUjianId, jenisUjianNama: jenis[p.jenisUjianId] || '-',
      durasiMenit: p.durasiMenit, aktif: p.aktif,
    }));
  }

  adminList(guruId) { return this._enrich(this.penugasan.where((p) => !guruId || p.guruId === guruId)); }
  guruList(guruId) { return this._enrich(this.penugasan.where((p) => p.guruId === guruId)); }

  adminSave(input) {
    Validate.object(input, 'Penugasan');
    const guru = this.users.findById(input.guruId);
    if (!guru || guru.role !== ROLE.GURU) throw Errors.validation('Guru tidak valid.');
    if (!this.mapel.findById(input.mapelId)) throw Errors.validation('Mata pelajaran tidak valid.');
    if (!this.jenis.findById(input.jenisUjianId)) throw Errors.validation('Jenis ujian tidak valid.');
    const durasi = Validate.int(input.durasiMenit === undefined ? EXAM.DEFAULT_DURATION_MINUTES : input.durasiMenit,
      'Waktu ujian (menit)', { min: 1, max: EXAM.MAX_DURATION_MINUTES });
    const dup = this.penugasan.where((p) => p.guruId === input.guruId && p.mapelId === input.mapelId &&
      p.jenisUjianId === input.jenisUjianId && p.id !== input.id)[0];
    if (dup) throw Errors.conflict('Penugasan yang sama sudah ada untuk guru ini.');
    const data = { guruId: input.guruId, mapelId: input.mapelId, jenisUjianId: input.jenisUjianId, durasiMenit: durasi };
    if (input.id) {
      if (!this.penugasan.findById(input.id)) throw Errors.notFound('Penugasan');
      return this.penugasan.update(input.id, data);
    }
    return this.penugasan.insert(Object.assign({ id: Ids.next('pgs'), aktif: true }, data));
  }

  adminRemove(id) {
    if (!this.penugasan.findById(id)) throw Errors.notFound('Penugasan');
    if (this.ujian.where((u) => u.penugasanId === id).length) {
      throw Errors.conflict('Penugasan sudah dipakai oleh ujian dan tidak bisa dihapus. Nonaktifkan saja.');
    }
    this.penugasan.delete(id);
    return { deleted: true };
  }

  /** Guru mengaktifkan/menonaktifkan mapel (penugasan) untuk dijadwalkan ujian. */
  guruSetAktif(guruId, id, aktif) {
    const p = this.penugasan.findById(id);
    if (!p || p.guruId !== guruId) throw Errors.notFound('Penugasan');
    this.penugasan.update(id, { aktif: Validate.bool(aktif) });
    return { id, aktif: Validate.bool(aktif) };
  }
}
