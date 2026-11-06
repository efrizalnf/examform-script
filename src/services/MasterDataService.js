/** CRUD generik untuk data master bernama sederhana (mapel, jenis ujian). */
class MasterDataService {
  constructor(deps) { Object.assign(this, deps); }
  list() { return this.repo.findAll().map((r) => ({ id: r.id, nama: r.nama })); }
  save(input) {
    Validate.object(input, this.label);
    const nama = Validate.string(input.nama, `Nama ${this.label.toLowerCase()}`, { max: 80 });
    const dup = this.repo.where((r) => r.nama.toLowerCase() === nama.toLowerCase() && r.id !== input.id)[0];
    if (dup) throw Errors.conflict(`${this.label} "${nama}" sudah ada.`);
    if (input.id) {
      if (!this.repo.findById(input.id)) throw Errors.notFound(this.label);
      this.repo.update(input.id, { nama });
      return { id: input.id, nama };
    }
    const row = { id: Ids.next(this.prefix), nama };
    this.repo.insert(row);
    return row;
  }
  remove(id) {
    if (!this.repo.findById(id)) throw Errors.notFound(this.label);
    if (this.usageCheck && this.usageCheck(id)) throw Errors.conflict(`${this.label} masih dipakai pada penugasan guru.`);
    this.repo.delete(id);
    return { deleted: true };
  }
}
