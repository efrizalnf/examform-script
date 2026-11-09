/**
 * Bank soal: kumpulan soal milik guru yang dapat dipakai ulang lintas ujian.
 * Guru hanya melihat/menggunakan bank miliknya; admin melihat semua.
 * Soal disalin (bukan ditautkan), jadi mengubah soal di ujian tidak memengaruhi bank, dan sebaliknya.
 */
class BankSoalService {
  constructor(deps) { Object.assign(this, deps); }

  _norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  /** Sidik jari sederhana (tipe + teks ternormalisasi) untuk deteksi duplikat. */
  _hash(tipe, teks) {
    const str = tipe + '|' + this._norm(teks);
    let x = 5381;
    for (let i = 0; i < str.length; i++) x = ((x * 33) ^ str.charCodeAt(i)) >>> 0;
    return x.toString(36) + '-' + str.length;
  }

  _canSee(principal, row) { return principal.role === ROLE.ADMIN || row.ownerId === principal.id; }

  _ujianFor(principal, ujianId) {
    const u = this.ujian.findById(ujianId);
    AccessPolicy.assertCanManageUjian(principal, u);
    return u;
  }

  list(principal, filter) {
    const f = filter || {};
    const mapel = {}; this.mapel.findAll().forEach((m) => { mapel[m.id] = m.nama; });
    const owner = {}; this.users.findAll().forEach((u) => { owner[u.id] = u.nama; });
    const q = this._norm(f.q);
    return this.bank.where((b) => this._canSee(principal, b) &&
      (!f.mapelId || b.mapelId === f.mapelId) && (!f.tipe || b.tipe === f.tipe) &&
      (!q || this._norm(b.teks).indexOf(q) >= 0))
      .map((b) => Object.assign({}, b, { mapelNama: mapel[b.mapelId] || '-', ownerNama: owner[b.ownerId] || '-' }))
      .sort((a, b) => String(b.dibuatPada).localeCompare(String(a.dibuatPada)));
  }

  /** Salin soal ujian (semua, atau yang dipilih) ke bank milik guru pemilik ujian. */
  saveFromUjian(principal, input) {
    Validate.object(input, 'Data');
    const u = this._ujianFor(principal, input.ujianId);
    let soal = this.soal.findBy('ujianId', u.id).sort((a, b) => a.urutan - b.urutan);
    if (Array.isArray(input.soalIds) && input.soalIds.length) {
      const pick = {}; input.soalIds.forEach((id) => { pick[id] = true; });
      soal = soal.filter((s) => pick[s.id]);
    }
    if (!soal.length) throw Errors.rule('TIDAK_ADA_SOAL', 'Tidak ada soal untuk disimpan ke bank soal.');
    const seen = {};
    this.bank.where((b) => b.ownerId === u.guruId && b.mapelId === u.mapelId).forEach((b) => { seen[b.hash] = true; });
    const rows = []; let duplikat = 0;
    soal.forEach((s) => {
      const hash = this._hash(s.tipe, s.teks);
      if (seen[hash]) { duplikat++; return; }
      seen[hash] = true;
      rows.push({
        id: Ids.next('bnk'), ownerId: u.guruId, mapelId: u.mapelId, tipe: s.tipe, teks: s.teks, opsi: s.opsi, kunci: s.kunci,
        bobot: s.bobot, hash, sumber: u.judul, dibuatPada: Clock.iso(),
      });
    });
    this.bank.insertMany(rows);
    return { disimpan: rows.length, duplikat };
  }

  /** Tambahkan soal dari bank ke sebuah ujian (disalin sebagai soal baru di akhir daftar). */
  importToUjian(principal, input) {
    Validate.object(input, 'Data');
    const u = this._ujianFor(principal, input.ujianId);
    if (!Array.isArray(input.bankIds) || !input.bankIds.length) throw Errors.validation('Pilih minimal satu soal dari bank soal.');
    this.soalService._assertEditable(u.id);
    const existing = this.soal.findBy('ujianId', u.id);
    const has = {}; existing.forEach((s) => { has[this._hash(s.tipe, s.teks)] = true; });
    let urutan = existing.reduce((m, s) => Math.max(m, s.urutan || 0), 0);
    const rows = []; let dilewati = 0;
    input.bankIds.forEach((id) => {
      const b = this.bank.findById(id);
      if (!b || !this._canSee(principal, b)) throw Errors.notFound('Soal bank');
      const hash = this._hash(b.tipe, b.teks);
      if (has[hash]) { dilewati++; return; }
      has[hash] = true;
      rows.push({
        id: Ids.next('soal'), ujianId: u.id, tipe: b.tipe, teks: b.teks, opsi: b.opsi, kunci: b.kunci,
        bobot: b.bobot, urutan: ++urutan, aktif: true, dibuatPada: Clock.iso(),
      });
    });
    this.soal.insertMany(rows);
    if (rows.length) this.soalService._markStale(u.id);
    return { ditambah: rows.length, dilewati };
  }

  remove(principal, id) {
    const b = this.bank.findById(id);
    if (!b || !this._canSee(principal, b)) throw Errors.notFound('Soal bank');
    this.bank.delete(id);
    return { deleted: true };
  }
}
