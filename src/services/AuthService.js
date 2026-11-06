class AuthService {
  constructor(deps) { Object.assign(this, deps); }

  /** @param {{role:string, username:string, password:string}} input */
  login(input) {
    Validate.object(input, 'Data login');
    const role = Validate.oneOf(input.role, [ROLE.ADMIN, ROLE.GURU, ROLE.SISWA], 'role');
    const username = Validate.string(input.username, role === ROLE.SISWA ? 'NIS' : 'Username', { max: 60 });
    const password = Validate.string(input.password, 'Kata sandi', { max: 100 });
    const throttleKey = `${role}:${username.toLowerCase()}`;
    this.throttle.assertAllowed(throttleKey);

    const account = this._find(role, username);
    const ok = account && account.aktif && this.passwords.verify(password, account.salt, account.passwordHash);
    if (!ok) {
      this.throttle.recordFailure(throttleKey);
      throw Errors.rule('INVALID_CREDENTIALS', 'Username/NIS atau kata sandi salah, atau akun tidak aktif.');
    }
    this.throttle.reset(throttleKey);
    return this._session(role, account);
  }

  _find(role, username) {
    if (role === ROLE.SISWA) return this.siswa.findById(username);
    const u = this.users.where((x) => x.username.toLowerCase() === username.toLowerCase() && x.role === role)[0];
    return u || null;
  }

  _session(role, account) {
    const principal = { id: account.id, role, name: account.nama };
    const t = this.tokens.issue(principal);
    const user = { id: account.id, nama: account.nama, role };
    if (role === ROLE.SISWA) Object.assign(user, { nis: account.nis, kelas: account.kelas, jenjang: account.jenjang });
    else user.username = account.username;
    return { token: t.token, expiresIn: t.expiresIn, user };
  }

  authenticate(token) { return this.tokens.verify(token); }

  changePassword(principal, input) {
    Validate.object(input, 'Data');
    const oldPw = Validate.string(input.passwordLama, 'Kata sandi lama', { max: 100 });
    const newPw = Validate.string(input.passwordBaru, 'Kata sandi baru', { max: 100 });
    this.passwords.assertStrongEnough(newPw);
    const repo = principal.role === ROLE.SISWA ? this.siswa : this.users;
    const acc = repo.findById(principal.id);
    if (!acc || !this.passwords.verify(oldPw, acc.salt, acc.passwordHash)) {
      throw Errors.rule('INVALID_CREDENTIALS', 'Kata sandi lama salah.');
    }
    const h = this.passwords.hash(newPw);
    repo.update(acc.id, { passwordHash: h.hash, salt: h.salt });
    return { changed: true };
  }
}
