/** Mengatur siswa yang berhak mengikuti suatu ujian. */
class PesertaService {
  constructor(deps) { Object.assign(this, deps); }

  /** Daftar semua siswa aktif + penanda terpilih. */
  get(principal, ujianId) {
    AccessPolicy.assertCanManageUjian(principal, this.ujian.findById(ujianId));
    const chosen = {}; this.peserta.where((p) => p.ujianId === ujianId).forEach((p) => { chosen[p.nis] = true; });
    return this.siswa.where((s) => s.aktif).map((s) => ({
      nis: s.nis, nama: s.nama, kelas: s.kelas, jenjang: Jenjang.normalize(s.jenjang) || s.jenjang, terpilih: !!chosen[s.nis],
    }));
  }

  /** Mengganti seluruh daftar peserta dengan nisList (diff: hanya tambah/hapus yang berubah). */
  set(principal, ujianId, nisList) {
    AccessPolicy.assertCanManageUjian(principal, this.ujian.findById(ujianId));
    const wanted = {};
    Validate.array(nisList, 'Daftar NIS', { max: 5000 }).forEach((n) => { wanted[String(n)] = true; });
    const valid = {}; this.siswa.findAll().forEach((s) => { valid[s.nis] = true; });
    const current = {}; this.peserta.where((p) => p.ujianId === ujianId).forEach((p) => { current[p.nis] = true; });

    const toAdd = Object.keys(wanted).filter((n) => valid[n] && !current[n]);
    const removed = this.peserta.deleteWhere((p) => p.ujianId === ujianId && !wanted[p.nis]);
    this.peserta.insertMany(toAdd.map((n) => ({ id: `${ujianId}:${n}`, ujianId, nis: n })));
    return { ditambah: toAdd.length, dihapus: removed, total: Object.keys(wanted).filter((n) => valid[n]).length };
  }
}
