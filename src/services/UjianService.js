class UjianService {
  constructor(deps) { Object.assign(this, deps); }

  _lookup(repo) { const m = {}; repo.findAll().forEach((r) => { m[r.id] = r.nama; }); return m; }

  _enrich(list) {
    const guruEmail = {}; this.users.findAll().forEach((x) => { guruEmail[x.id] = x.email || ''; });
    const guru = this._lookup(this.users), mapel = this._lookup(this.mapel), jenis = this._lookup(this.jenis);
    // Hanya kolom yang dibutuhkan (tabel Soal bisa besar: jangan memuat seluruh isinya hanya untuk menghitung).
    const nSoal = {}, nAktif = {}, nPeserta = {};
    this.soal.pluck(['ujianId', 'aktif']).forEach((s) => { nSoal[s.ujianId] = (nSoal[s.ujianId] || 0) + 1; if (s.aktif) nAktif[s.ujianId] = (nAktif[s.ujianId] || 0) + 1; });
    this.peserta.pluck(['ujianId']).forEach((p) => { nPeserta[p.ujianId] = (nPeserta[p.ujianId] || 0) + 1; });
    return list.map((u) => Object.assign({}, u, {
      guruNama: guru[u.guruId] || '-', guruEmail: guruEmail[u.guruId] || '', mapelNama: mapel[u.mapelId] || '-', jenisUjianNama: jenis[u.jenisUjianId] || '-',
      jumlahSoal: nSoal[u.id] || 0, jumlahSoalAktif: nAktif[u.id] || 0, jumlahPeserta: nPeserta[u.id] || 0,
      mode: u.formId ? EXAM_MODE.GFORM : EXAM_MODE.NATIVE,
    }));
  }

  list(principal) {
    return this._enrich(this.ujian.where((u) => principal.role === ROLE.ADMIN || u.guruId === principal.id));
  }

  /**
   * Buat/ubah ujian (admin atau guru). Admin membuat atas nama guru pemilik penugasan.
   * Guru hanya boleh memakai penugasannya sendiri.
   */
  save(principal, input) {
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
      AccessPolicy.assertCanManageUjian(principal, cur);
      const durasi = Validate.int(input.durasiMenit === undefined ? cur.durasiMenit : input.durasiMenit,
        'Waktu ujian (menit)', { min: 1, max: EXAM.MAX_DURATION_MINUTES });
      const patch = Object.assign({ judul, deskripsi, mulai, selesai, durasiMenit: durasi }, flags);
      // judul/deskripsi/acak tampil di Google Form -> perlu deploy ulang
      if (cur.formId && (cur.judul !== judul || cur.deskripsi !== deskripsi || cur.acakSoal !== flags.acakSoal)) patch.formStale = true;
      this.ujian.update(cur.id, patch);
      return this._enrich([this.ujian.findById(cur.id)])[0];
    }

    const pg = this.penugasan.findById(input.penugasanId);
    if (!pg || (principal.role === ROLE.GURU && pg.guruId !== principal.id)) {
      throw Errors.validation('Penugasan (mapel & jenis ujian) tidak valid.');
    }
    if (!pg.aktif) throw Errors.rule('MAPEL_NONAKTIF', 'Mapel ini sedang nonaktif. Aktifkan dulu untuk menjadwalkan ujian.');
    const durasi = Validate.int(input.durasiMenit === undefined ? pg.durasiMenit : input.durasiMenit,
      'Waktu ujian (menit)', { min: 1, max: EXAM.MAX_DURATION_MINUTES });
    const row = Object.assign({
      id: Ids.next('ujn'), guruId: pg.guruId, penugasanId: pg.id, mapelId: pg.mapelId, jenisUjianId: pg.jenisUjianId,
      judul, deskripsi, durasiMenit: durasi, mulai, selesai,
      token: this.newToken(), kodeKeluar: this.newExitCode(), aktif: false, dibuatPada: Clock.iso(), formAccepting: false, formStale: false,
    }, flags);
    this.ujian.insert(row);
    return this._enrich([row])[0];
  }

  /** Kompatibilitas: dipakai rute lama guru.ujian.save. */
  guruSave(guruId, input) { return this.save({ id: guruId, role: ROLE.GURU }, input); }

  newToken() { return CryptoUtil.randomString(EXAM.EXAM_TOKEN_LENGTH, ALPHABET.READABLE); }

  newExitCode() { return CryptoUtil.randomString(EXAM.EXIT_CODE_LENGTH, ALPHABET.READABLE); }

  /** Generate (ulang) kode keluar pengawas (guru pemilik atau admin). */
  generateKodeKeluar(principal, id) {
    const u = this.ujian.findById(id);
    AccessPolicy.assertCanManageUjian(principal, u);
    const kodeKeluar = this.newExitCode();
    this.ujian.update(id, { kodeKeluar });
    return { id, kodeKeluar };
  }

  /** Generate ulang token ujian (guru pemilik atau admin). */
  generateToken(principal, id) {
    const u = this.ujian.findById(id);
    AccessPolicy.assertCanManageUjian(principal, u);
    const token = this.newToken();
    this.ujian.update(id, { token });
    return { id, token };
  }

  /** Aktif/nonaktifkan ujian (admin atau guru pemilik). Form Google ikut dibuka/ditutup. */
  setAktif(principal, id, aktif) {
    const u = this.ujian.findById(id);
    AccessPolicy.assertCanManageUjian(principal, u);
    const on = Validate.bool(aktif);
    if (on && !this.soal.findBy('ujianId', id).filter((s) => s.aktif).length) {
      throw Errors.rule('TIDAK_ADA_SOAL', 'Ujian belum memiliki soal aktif.');
    }
    const patch = { aktif: on };
    let formWarning = null;
    if (u.formId) {
      try { this.forms.setAccepting(u.formId, on); patch.formAccepting = on; }
      catch (e) { Log.error('Gagal mengubah status form', e, { ujianId: id }); formWarning = 'Status Google Form gagal diperbarui; coba lagi.'; }
    }
    this.ujian.update(id, patch);
    return { id, aktif: on, formWarning };
  }

  /** Kompatibilitas: rute lama admin.ujian.setAktif. */
  adminSetAktif(id, aktif) { return this.setAktif({ id: 'admin', role: ROLE.ADMIN }, id, aktif); }

  remove(principal, id) {
    const u = this.ujian.findById(id);
    AccessPolicy.assertCanManageUjian(principal, u);
    if (this.sesi.findBy('ujianId', id).length) {
      throw Errors.conflict('Ujian sudah pernah dikerjakan siswa dan tidak dapat dihapus. Nonaktifkan saja.');
    }
    if (u.formId) { try { this.forms.setAccepting(u.formId, false); } catch (e) { Log.error('Gagal menutup form', e); } }
    this.soal.deleteWhere((s) => s.ujianId === id);
    this.peserta.deleteWhere((p) => p.ujianId === id);
    this.ujian.delete(id);
    return { deleted: true };
  }

  guruRemove(guruId, id) { return this.remove({ id: guruId, role: ROLE.GURU }, id); }
}
