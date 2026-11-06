class PasswordService {
  _pepper() {
    const p = PropertiesService.getScriptProperties().getProperty(PROP.AUTH_SECRET);
    if (!p) throw Errors.rule('NOT_CONFIGURED', 'AUTH_SECRET belum diset. Jalankan setup().');
    return p;
  }
  /** @returns {{hash:string, salt:string}} */
  hash(password) {
    const salt = CryptoUtil.randomSalt();
    return { salt, hash: CryptoUtil.hmacHex(`${salt}:${password}`, this._pepper()) };
  }
  verify(password, salt, expectedHash) {
    if (!salt || !expectedHash) return false;
    return CryptoUtil.safeEqual(CryptoUtil.hmacHex(`${salt}:${password}`, this._pepper()), expectedHash);
  }
  generate(length) {
    return CryptoUtil.randomString(length || AUTH.GENERATED_PASSWORD_LENGTH, ALPHABET.PASSWORD);
  }
  assertStrongEnough(password) {
    if (!password || String(password).length < AUTH.PASSWORD_MIN_LENGTH) {
      throw Errors.validation(`Kata sandi minimal ${AUTH.PASSWORD_MIN_LENGTH} karakter.`);
    }
  }
}
