class UjianService {
  constructor(deps) { Object.assign(this, deps); }

  _lookup(repo) { const m = {}; repo.findAll().forEach((r) => { m[r.id] = r.nama; }); return m; }

  _enrich(list) {
    const guru = this._lookup(this.users), mapel = this._lookup(this.mapel), jenis = this._lookup(this.jenis);
    const soal = this.soal.findAll(), peserta = this.peserta.findAll();
    return list.map((u) => Object.assign({}, u, {
      guruNama: guru[u.guruId] || '-', mapelNama: mapel[u.mapelId] || '-', jenisUjianNama: jenis[u.jenisUjianId] || '-',
      jumlahSoal: soal.filter((s) => s.ujianId === u.id).length,
      jumlahSoalAktif: soal.filter((s) => s.ujianId === u.id && s.aktif).length,
      jumlahPeserta: peserta.filter((p) => p.ujianId === u.id).length,
    }));
  }

  list(principal) {
    return this._enrich(this.ujian.where((u) => principal.role === ROLE.ADMIN || u.guruId === principal.id));
  }

  /** Guru membuat/mengubah ujian dan mengatur waktu ujian. */
  guruSave(guruId, input) {
    Validate.object(input, 'Data ujian');
    const judul = Validate.string(input.judul, 'Judul ujian', { max: 150 });
    const deskripsi = Validate.string(input.deskripsi, 'Deskripsi', { max: 1000, required: false });
    const mulai = Validate.isoDateOrEmpty(input.mulai, 'Waktu mulai');
    const selesai = Validate.isoDateOrEmpty(input.selesai, 'Waktu selesai');
    if (mulai && selesai && new Date(selesai) <= new Date(mulai)) {
      throw Errors.validation('Waktu selesai harus setelah waktu mulai.');
    }
    const flags = {
      acakSoal: input.acakSoal === undefined ? true : Validate.bool(input.acakSoal),
      acakOpsi: input.acakOpsi === undefined ? true : Validate.bool(input.acakOpsi),
      tampilNilai: input.tampilNilai === undefined ? false : Validate.bool(input.tampilNilai),
    };

    if (input.id) {
      const cur = this.ujian.findById(input.id);
      AccessPolicy.assertCanManageUjian({ id: guruId, role: ROLE.GURU }, cur);
      const durasi = Validate.int(input.durasiMenit === undefined ? cur.durasiMenit : input.durasiMenit,
        'Waktu ujian (menit)', { min: 1, max: EXAM.MAX_DURATION_MINUTES });
      const patch = Object.assign({ judul, deskripsi, mulai, selesai, durasiMenit: durasi }, flags);
      this.ujian.update(cur.id, patch);
      return this._enrich([this.ujian.findById(cur.id)])[0];
    }

    const pg = this.penugasan.findById(input.penugasanId);
    if (!pg || pg.guruId !== guruId) throw Errors.validation('Penugasan (mapel & jenis ujian) tidak valid.');
    if (!pg.aktif) throw Errors.rule('MAPEL_NONAKTIF', 'Mapel ini sedang nonaktif. Aktifkan dulu untuk menjadwalkan ujian.');
    const durasi = Validate.int(input.durasiMenit === undefined ? pg.durasiMenit : input.durasiMenit,
      'Waktu ujian (menit)', { min: 1, max: EXAM.MAX_DURATION_MINUTES });
    const row = Object.assign({
      id: Ids.next('ujn'), guruId, penugasanId: pg.id, mapelId: pg.mapelId, jenisUjianId: pg.jenisUjianId,
      judul, deskripsi, durasiMenit: durasi, mulai, selesai,
      token: this.newToken(), aktif: false, dibuatPada: Clock.iso(),
    }, flags);
    this.ujian.insert(row);
    return this._enrich([row])[0];
  }

  newToken() { return CryptoUtil.randomString(EXAM.EXAM_TOKEN_LENGTH, ALPHABET.READABLE); }

  /** Generate ulang token ujian (guru pemilik atau admin). */
  generateToken(principal, id) {
    const u = this.ujian.findById(id);
    AccessPolicy.assertCanManageUjian(principal, u);
    const token = this.newToken();
    this.ujian.update(id, { token });
    return { id, token };
  }

  /** Admin mengaktifkan/menonaktifkan ujian. */
  adminSetAktif(id, aktif) {
    const u = this.ujian.findById(id);
    if (!u) throw Errors.notFound('Ujian');
    const on = Validate.bool(aktif);
    if (on && !this.soal.where((s) => s.ujianId === id && s.aktif).length) {
      throw Errors.rule('TIDAK_ADA_SOAL', 'Ujian belum memiliki soal aktif.');
    }
    this.ujian.update(id, { aktif: on });
    return { id, aktif: on };
  }

  guruRemove(guruId, id) {
    const u = this.ujian.findById(id);
    AccessPolicy.assertCanManageUjian({ id: guruId, role: ROLE.GURU }, u);
    if (this.sesi.findBy('ujianId', id).length) {
      throw Errors.conflict('Ujian sudah pernah dikerjakan siswa dan tidak dapat dihapus. Nonaktifkan saja.');
    }
    this.soal.deleteWhere((s) => s.ujianId === id);
    this.peserta.deleteWhere((p) => p.ujianId === id);
    this.ujian.delete(id);
    return { deleted: true };
  }
}
