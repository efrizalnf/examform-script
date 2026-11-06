/** Alur ujian dari sisi siswa: daftar ujian aktif, mulai (token), simpan jawaban, selesai. Timer dihitung server. */
class StudentExamService {
  constructor(deps) { Object.assign(this, deps); }

  _sesiId(ujianId, nis) { return `${ujianId}:${nis}`; }
  _names(repo) { const m = {}; repo.findAll().forEach((r) => { m[r.id] = r.nama; }); return m; }
  _remaining(sesi, now) { return Math.max(0, Math.floor((new Date(sesi.batas).getTime() - now.getTime()) / 1000)); }
  _expired(sesi, now) { return now.getTime() > new Date(sesi.batas).getTime(); }

  /** Dashboard: hanya ujian aktif yang diikuti siswa ini. */
  listAvailable(nis) {
    const now = Clock.now();
    const mySesi = {}; this.sesi.findBy('nis', nis).forEach((s) => { mySesi[s.ujianId] = s; });
    const mapel = this._names(this.mapel), jenis = this._names(this.jenis), guru = this._names(this.users);
    const out = [];
    this.peserta.findBy('nis', nis).forEach((p) => {
      const u = this.ujian.findById(p.ujianId);
      if (!u || !u.aktif) return;
      const pg = this.penugasan.findById(u.penugasanId);
      if (!pg || !pg.aktif) return;

      let s = mySesi[u.id] || null;
      if (s && s.status === SESSION_STATUS.BERLANGSUNG && this._expired(s, now)) s = this._finalize(s);
      const status = !s ? STUDENT_EXAM_STATUS.BELUM
        : (s.status === SESSION_STATUS.SELESAI ? STUDENT_EXAM_STATUS.SELESAI : STUDENT_EXAM_STATUS.BERLANGSUNG);
      const closed = !!u.selesai && now > new Date(u.selesai);
      if (status === STUDENT_EXAM_STATUS.BELUM && closed) return;
      const jumlahSoal = this.soal.findBy('ujianId', u.id).filter((q) => q.aktif).length;
      if (status === STUDENT_EXAM_STATUS.BELUM && !jumlahSoal) return;

      const item = {
        id: u.id, judul: u.judul, deskripsi: u.deskripsi,
        mapel: mapel[u.mapelId] || '-', jenisUjian: jenis[u.jenisUjianId] || '-', guru: guru[u.guruId] || '-',
        durasiMenit: u.durasiMenit, mulai: u.mulai, selesai: u.selesai, jumlahSoal,
        mode: u.formId ? EXAM_MODE.GFORM : EXAM_MODE.NATIVE,
        status, sesiId: s ? s.id : null,
        bisaMulai: !u.formStale && (status === STUDENT_EXAM_STATUS.BERLANGSUNG || (status === STUDENT_EXAM_STATUS.BELUM && !closed && (!u.mulai || now >= new Date(u.mulai)))),
      };
      if (status === STUDENT_EXAM_STATUS.BERLANGSUNG) item.sisaDetik = this._remaining(s, now);
      if (status === STUDENT_EXAM_STATUS.SELESAI && u.tampilNilai && !s.perluKoreksi && s.skorMaksimum > 0) item.nilai = s.nilai;
      out.push(item);
    });
    out.sort((a, b) => String(a.mulai || '').localeCompare(String(b.mulai || '')));
    return { serverTime: Clock.iso(now), ujian: out };
  }

  _assertAvailable(nis, u, now) {
    if (!u || !u.aktif) throw Errors.rule('UJIAN_TIDAK_TERSEDIA', 'Ujian tidak tersedia.');
    const pg = this.penugasan.findById(u.penugasanId);
    if (!pg || !pg.aktif) throw Errors.rule('UJIAN_TIDAK_TERSEDIA', 'Ujian tidak tersedia.');
    if (!this.peserta.findById(`${u.id}:${nis}`)) throw Errors.rule('BUKAN_PESERTA', 'Anda tidak terdaftar sebagai peserta ujian ini.');
    if (u.formStale) throw Errors.rule('FORM_USANG', 'Ujian sedang diperbarui oleh guru. Hubungi pengawas.');
  }

  /** Mulai (atau lanjutkan) ujian. Token wajib untuk memulai pertama kali. */
  start(nis, input) {
    Validate.object(input, 'Data');
    const ujianId = Validate.string(input.ujianId, 'ujianId', { max: 60 });
    const sesiId = this._sesiId(ujianId, nis);
    if (!Mutex.tryAcquire(`start:${sesiId}`, 10)) throw Errors.rule('BUSY', 'Permintaan sedang diproses, coba lagi.');
    try {
      const now = Clock.now();
      const u = this.ujian.findById(ujianId);
      this._assertAvailable(nis, u, now);

      let s = this.sesi.findById(sesiId);
      if (s) {
        if (s.status === SESSION_STATUS.SELESAI) throw Errors.rule('SUDAH_SELESAI', 'Anda sudah menyelesaikan ujian ini.');
        if (this._expired(s, now)) { this._finalize(s); throw Errors.rule('SUDAH_SELESAI', 'Waktu ujian Anda sudah habis.'); }
        return this._payload(s, u, now);
      }

      const token = String(input.token || '').trim().toUpperCase();
      if (!CryptoUtil.safeEqual(token, String(u.token).toUpperCase())) throw Errors.rule('TOKEN_INVALID', 'Token ujian salah.');
      if (u.mulai && now < new Date(u.mulai)) throw Errors.rule('BELUM_DIMULAI', 'Ujian belum dibuka.');
      if (u.selesai && now > new Date(u.selesai)) throw Errors.rule('SUDAH_DITUTUP', 'Ujian sudah ditutup.');

      const bank = this.soal.findBy('ujianId', u.id).filter((q) => q.aktif).sort((a, b) => a.urutan - b.urutan);
      if (!bank.length) throw Errors.rule('TIDAK_ADA_SOAL', 'Ujian belum memiliki soal.');
      if (u.formId && !u.formAccepting) throw Errors.rule('FORM_DITUTUP', 'Formulir ujian sedang ditutup.');
      const ids = bank.map((q) => q.id);
      const layouts = {};
      bank.forEach((q) => { layouts[q.id] = QuestionTypeRegistry.get(q.tipe).buildLayout(q, u.acakOpsi); });

      let batas = Clock.addMinutes(now, u.durasiMenit);
      if (u.selesai && new Date(u.selesai) < batas) batas = new Date(u.selesai);
      s = {
        id: sesiId, ujianId: u.id, nis, mulai: Clock.iso(now), batas: Clock.iso(batas), selesai: '',
        status: SESSION_STATUS.BERLANGSUNG, layout: { soal: u.acakSoal ? Shuffle.array(ids) : ids, layouts },
        skorPerolehan: 0, skorMaksimum: u.formId ? 0 : bank.reduce((m, q) => m + q.bobot, 0), nilai: 0, perluKoreksi: false,
      };
      this.sesi.insert(s);
      return this._payload(s, u, now);
    } finally { Mutex.release(`start:${sesiId}`); }
  }

  _ownedSesi(nis, sesiId) {
    const s = this.sesi.findById(sesiId);
    if (!s || s.nis !== nis) throw Errors.notFound('Sesi ujian');
    return s;
  }

  /**
   * Verifikasi kode keluar pengawas untuk keluar sementara dari ujian.
   * Kode dibuat guru/admin per ujian dan hanya dibandingkan di server
   * (tidak pernah dikirim ke aplikasi siswa). Dibatasi percobaan salah.
   */
  verifyExitCode(nis, input) {
    Validate.object(input, 'Data');
    const s = this._ownedSesi(nis, input.sesiId);
    const key = `exit:${nis}`;
    this.throttle.assertAllowed(key, 'Terlalu banyak kode keluar yang salah. Coba lagi beberapa menit lagi.');
    const u = this.ujian.findById(s.ujianId);
    const expected = String((u && u.kodeKeluar) || '').trim().toUpperCase();
    if (!expected) throw Errors.rule('KODE_KELUAR_BELUM_ADA', 'Kode keluar belum dibuat oleh guru/admin.');
    const given = String(input.kode === undefined || input.kode === null ? '' : input.kode).trim().toUpperCase();
    if (!CryptoUtil.safeEqual(given, expected)) {
      this.throttle.recordFailure(key);
      throw Errors.rule('KODE_KELUAR_SALAH', 'Kode keluar ujian salah. Ujian tetap berjalan.');
    }
    this.throttle.reset(key);
    return { ok: true };
  }

  /** Ambil ulang state sesi (mis. setelah aplikasi ditutup). */
  getSession(nis, sesiId) {
    const now = Clock.now();
    let s = this._ownedSesi(nis, sesiId);
    const u = this.ujian.findById(s.ujianId);
    if (s.status === SESSION_STATUS.BERLANGSUNG && this._expired(s, now)) s = this._finalize(s);
    return s.status === SESSION_STATUS.SELESAI ? this._result(s, u) : this._payload(s, u, now);
  }

  /** Simpan satu atau banyak jawaban. answers = [{soalId, jawaban}] */
  saveAnswers(nis, input) {
    Validate.object(input, 'Data');
    const now = Clock.now();
    const s = this._ownedSesi(nis, input.sesiId);
    if (this._isForm(s)) throw Errors.rule('MODE_GFORM', 'Ujian ini dikerjakan di Google Form; jawaban tidak dikirim lewat API.');
    if (s.status === SESSION_STATUS.SELESAI) throw Errors.rule('SUDAH_SELESAI', 'Ujian sudah selesai.');
    if (now.getTime() > new Date(s.batas).getTime() + EXAM.GRACE_SECONDS * 1000) {
      this._finalize(s);
      throw Errors.rule('WAKTU_HABIS', 'Waktu ujian telah habis.');
    }
    const saved = this._storeAnswers(s, Validate.array(input.answers, 'answers', { min: 1, max: 200 }), now);
    return { saved, sisaDetik: this._remaining(s, now), serverTime: Clock.iso(now) };
  }

  _storeAnswers(s, answers, now) {
    const allowed = {}; s.layout.soal.forEach((id) => { allowed[id] = true; });
    answers.forEach((a) => {
      Validate.object(a, 'Jawaban');
      if (!allowed[a.soalId]) throw Errors.validation(`Soal ${a.soalId} bukan bagian dari ujian ini.`);
      const value = a.jawaban === undefined ? null : a.jawaban;
      if (JSON.stringify(value).length > 20000) throw Errors.validation('Jawaban terlalu panjang.');
      this.jawaban.upsert({ id: `${s.id}:${a.soalId}`, sesiId: s.id, soalId: a.soalId, jawaban: value, diubahPada: Clock.iso(now) });
    });
    return answers.length;
  }

  /** Selesaikan ujian. Boleh menyertakan jawaban terakhir (answers). */
  finish(nis, input) {
    Validate.object(input, 'Data');
    const now = Clock.now();
    let s = this._ownedSesi(nis, input.sesiId);
    const u = this.ujian.findById(s.ujianId);
    if (s.status === SESSION_STATUS.BERLANGSUNG) {
      const inTime = now.getTime() <= new Date(s.batas).getTime() + EXAM.GRACE_SECONDS * 1000;
      if (inTime && !this._isForm(s) && Array.isArray(input.answers) && input.answers.length) this._storeAnswers(s, input.answers, now);
      s = this._finalize(s);
    }
    return this._result(s, u);
  }

  _finalize(s) {
    if (s.status === SESSION_STATUS.SELESAI) return s;
    const end = new Date(Math.min(Clock.nowMs(), new Date(s.batas).getTime()));
    this.sesi.update(s.id, { status: SESSION_STATUS.SELESAI, selesai: Clock.iso(end) });
    if (!this._isForm(s)) this.grading.gradeSession(Object.assign({}, s, { status: SESSION_STATUS.SELESAI }));
    return this.sesi.findById(s.id);
  }

  /** Dipanggil trigger waktu: tutup sesi yang melewati batas. */
  finalizeExpired(budgetMs) {
    const started = Date.now(); const now = Clock.now(); let n = 0;
    const open = this.sesi.findBy('status', SESSION_STATUS.BERLANGSUNG);
    for (let i = 0; i < open.length; i++) {
      if (Date.now() - started > (budgetMs || 240000)) break;
      if (this._expired(open[i], now)) { this._finalize(open[i]); n++; }
    }
    return n;
  }

  _isForm(s) { const u = this.ujian.findById(s.ujianId); return !!(u && u.formId); }

  _sesiView(s, u, now) {
    return {
      id: s.id, ujianId: s.ujianId, judul: u.judul, durasiMenit: u.durasiMenit, status: s.status,
      mulai: s.mulai, batas: s.batas, sisaDetik: this._remaining(s, now), serverTime: Clock.iso(now),
    };
  }

  /** Mode Google Form: kirim link form (NIS & nama terisi otomatis), bukan soal. */
  _formPayload(s, u, now) {
    const siswa = this.siswa.findById(s.nis) || {};
    const formUrl = this.forms.prefilledUrl({
      formId: u.formId, nisItemId: u.formNisItemId, namaItemId: u.formNamaItemId, nis: s.nis, nama: siswa.nama || s.nis,
    });
    return { mode: EXAM_MODE.GFORM, sesi: this._sesiView(s, u, now), formUrl };
  }

  _payload(s, u, now) {
    if (u.formId) return this._formPayload(s, u, now);
    const bank = {}; this.soal.findBy('ujianId', s.ujianId).forEach((q) => { bank[q.id] = q; });
    const jawaban = {}; this.jawaban.findBy('sesiId', s.id).forEach((j) => { jawaban[j.soalId] = j.jawaban; });
    const soal = s.layout.soal.map((id, i) => {
      const q = bank[id]; if (!q) return null;
      const view = QuestionTypeRegistry.get(q.tipe).present(q, s.layout.layouts[id]);
      return Object.assign({ id, nomor: i + 1, tipe: q.tipe, teks: q.teks, bobot: q.bobot }, view);
    }).filter(Boolean);
    return { mode: EXAM_MODE.NATIVE, sesi: this._sesiView(s, u, now), soal, jawaban };
  }

  _result(s, u) {
    const showScore = u && u.tampilNilai && !s.perluKoreksi && s.skorMaksimum > 0;
    return {
      sesi: { id: s.id, ujianId: s.ujianId, status: SESSION_STATUS.SELESAI, selesai: s.selesai, judul: u && u.judul },
      hasil: showScore ? { nilai: s.nilai, skorPerolehan: s.skorPerolehan, skorMaksimum: s.skorMaksimum } : null,
    };
  }
}
