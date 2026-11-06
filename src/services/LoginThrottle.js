/** Pembatas percobaan login (per akun) memakai CacheService. */
class LoginThrottle {
  _key(k) { return `login_fail:${k}`; }
  assertAllowed(k, message) {
    const n = Number(CacheService.getScriptCache().get(this._key(k)) || 0);
    if (n >= AUTH.MAX_FAILED_LOGIN) {
      throw Errors.rule('TOO_MANY_ATTEMPTS', message || 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.');
    }
  }
  recordFailure(k) {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(this._key(k)) || 0) + 1;
    cache.put(this._key(k), String(n), AUTH.LOCK_SECONDS);
  }
  reset(k) { CacheService.getScriptCache().remove(this._key(k)); }
}
