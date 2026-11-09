/** Manajemen akun staf (admin & guru). */
class UserService {
  constructor(deps) { Object.assign(this, deps); }

  listGuru() {
    const penugasan = this.penugasan.findAll();
    return this.users.where((u) => u.role === ROLE.GURU).map((u) => ({
      id: u.id, username: u.username, nama: u.nama, email: u.email || '', aktif: u.aktif,
      jumlahPenugasan: penugasan.filter((p) => p.guruId === u.id).length,
    }));
  }

  /** Buat/ubah guru. Password hanya dikembalikan saat dibuat (atau jika diminta reset). */
  saveGuru(input) {
    Validate.object(input, 'Data guru');
    const username = Validate.string(input.username, 'Username', { max: 40 });
    const nama = Validate.string(input.nama, 'Nama', { max: 100 });
    const aktif = input.aktif === undefined ? true : Validate.bool(input.aktif);
    const email = this._email(input.email);
    if (email && this.users.where((u) => u.role === ROLE.GURU && (u.email || '').toLowerCase() === email && u.id !== input.id).length) {
      throw Errors.conflict(`Email "${email}" sudah dipakai guru lain.`);
    }
    const clash = this.users.where((u) => u.username.toLowerCase() === username.toLowerCase() && u.id !== input.id)[0];
    if (clash) throw Errors.conflict(`Username "${username}" sudah dipakai.`);

    if (input.id) {
      const cur = this.users.findById(input.id);
      if (!cur || cur.role !== ROLE.GURU) throw Errors.notFound('Guru');
      this.users.update(cur.id, { username, nama, aktif, email });
      return { id: cur.id, username, nama, email, aktif };
    }
    return this.createAccount({ username, nama, email, aktif, role: ROLE.GURU, password: input.password });
  }

  /** Email opsional, tetapi bila diisi harus berformat valid dan unik di antara guru. */
  _email(v, selfId) {
    const e = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
    if (!e) return '';
    if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw Errors.validation('Format email tidak valid.');
    return e;
  }

  createAccount({ username, nama, email, role, aktif, password }) {
    let plain = password;
    if (plain) this.passwords.assertStrongEnough(plain); else plain = this.passwords.generate();
    const h = this.passwords.hash(plain);
    const row = {
      id: Ids.next(role === ROLE.ADMIN ? 'adm' : 'gru'), username, nama, role,
      passwordHash: h.hash, salt: h.salt, aktif: aktif !== false, dibuatPada: Clock.iso(), email: email || '',
    };
    this.users.insert(row);
    return { id: row.id, username, nama, email: row.email, aktif: row.aktif, password: plain };
  }

  resetPassword(id) {
    const u = this.users.findById(id);
    if (!u) throw Errors.notFound('Akun');
    const plain = this.passwords.generate();
    const h = this.passwords.hash(plain);
    this.users.update(id, { passwordHash: h.hash, salt: h.salt });
    return { id, username: u.username, password: plain };
  }

  removeGuru(id) {
    const u = this.users.findById(id);
    if (!u || u.role !== ROLE.GURU) throw Errors.notFound('Guru');
    if (this.penugasan.where((p) => p.guruId === id).length) {
      throw Errors.conflict('Guru masih memiliki penugasan. Hapus penugasannya terlebih dahulu.');
    }
    this.users.delete(id);
    return { deleted: true };
  }
}
