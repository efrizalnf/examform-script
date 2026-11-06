class SiswaService {
  constructor(deps) { Object.assign(this, deps); }

  _public(s) { return { nis: s.nis, nama: s.nama, kelas: s.kelas, jenjang: s.jenjang, aktif: s.aktif }; }

  list(filter) {
    const f = filter || {};
    const q = String(f.q || '').toLowerCase();
    return this.siswa.where((s) =>
      (!f.kelas || s.kelas === f.kelas) && (!f.jenjang || s.jenjang === f.jenjang) &&
      (!q || s.nama.toLowerCase().indexOf(q) >= 0 || s.nis.indexOf(q) >= 0)
    ).map((s) => this._public(s));
  }

  _normalize(input) {
    Validate.object(input, 'Data siswa');
    return {
      nis: Validate.string(input.nis, 'NIS', { max: 30 }),
      nama: Validate.string(input.nama, 'Nama', { max: 100 }),
      kelas: Validate.string(input.kelas, 'Kelas', { max: 30 }),
      jenjang: Validate.string(input.jenjang, 'Jenjang', { max: 30 }),
      aktif: input.aktif === undefined ? true : Validate.bool(input.aktif),
    };
  }

  /** Tambah/ubah satu siswa. Siswa baru otomatis mendapat password (dikembalikan sekali). */
  save(input) {
    const d = this._normalize(input);
    const existing = this.siswa.findById(d.nis);
    if (existing) {
      this.siswa.update(d.nis, d);
      return Object.assign(this._public(Object.assign(existing, d)), { baru: false });
    }
    const plain = input.password ? String(input.password) : this.passwords.generate();
    this.passwords.assertStrongEnough(plain);
    const h = this.passwords.hash(plain);
    this.siswa.insert(Object.assign({ id: d.nis, passwordHash: h.hash, salt: h.salt, dibuatPada: Clock.iso() }, d));
    return Object.assign(this._public(d), { baru: true, password: plain });
  }

  /** Impor massal. Mengembalikan kredensial siswa baru. */
  importMany(list) {
    const items = Validate.array(list, 'Daftar siswa', { min: 1, max: 2000 });
    const errors = [];
    const seen = {};
    const newRows = []; const patches = {}; const credentials = [];
    const existing = {}; this.siswa.findAll().forEach((s) => { existing[s.id] = true; });
    items.forEach((raw, i) => {
      let d;
      try { d = this._normalize(raw); } catch (e) { errors.push({ baris: i + 1, pesan: e.message }); return; }
      if (seen[d.nis]) { errors.push({ baris: i + 1, pesan: `NIS ${d.nis} duplikat di daftar.` }); return; }
      seen[d.nis] = true;
      if (existing[d.nis]) { patches[d.nis] = d; return; }
      const plain = this.passwords.generate();
      const h = this.passwords.hash(plain);
      newRows.push(Object.assign({ id: d.nis, passwordHash: h.hash, salt: h.salt, dibuatPada: Clock.iso() }, d));
      credentials.push({ nis: d.nis, nama: d.nama, kelas: d.kelas, password: plain });
    });
    this.siswa.insertMany(newRows);
    this.siswa.updateMany(patches);
    return { ditambah: newRows.length, diperbarui: Object.keys(patches).length, gagal: errors, kredensial: credentials };
  }

  /** Generate ulang password. Target: nisList, atau kelas/jenjang, atau semua bila kosong. */
  generatePasswords(opts) {
    const o = opts || {};
    const wanted = Array.isArray(o.nisList) && o.nisList.length ? o.nisList.map(String) : null;
    const targets = this.siswa.where((s) =>
      (!wanted || wanted.indexOf(s.nis) >= 0) && (!o.kelas || s.kelas === o.kelas) && (!o.jenjang || s.jenjang === o.jenjang));
    if (!targets.length) throw Errors.notFound('Siswa');
    const patches = {}; const out = [];
    targets.forEach((s) => {
      const plain = this.passwords.generate();
      const h = this.passwords.hash(plain);
      patches[s.id] = { passwordHash: h.hash, salt: h.salt };
      out.push({ nis: s.nis, nama: s.nama, kelas: s.kelas, jenjang: s.jenjang, password: plain });
    });
    this.siswa.updateMany(patches);
    return out;
  }

  remove(nis) {
    if (!this.siswa.findById(nis)) throw Errors.notFound('Siswa');
    this.siswa.delete(nis);
    this.peserta.deleteWhere((p) => p.nis === String(nis));
    return { deleted: true };
  }
}
