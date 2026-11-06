/** Token sesi bertanda tangan (stateless): base64url(payload).HMAC. */
class AuthTokenService {
  _secret() {
    const s = PropertiesService.getScriptProperties().getProperty(PROP.AUTH_SECRET);
    if (!s) throw Errors.rule('NOT_CONFIGURED', 'AUTH_SECRET belum diset. Jalankan setup().');
    return s;
  }
  issue(principal) {
    const ttl = AUTH.TOKEN_TTL_SECONDS[principal.role] || 3600;
    const payload = {
      sub: principal.id, role: principal.role, name: principal.name,
      exp: Math.floor(Clock.nowMs() / 1000) + ttl,
    };
    const body = CryptoUtil.b64url(JSON.stringify(payload));
    return { token: `${body}.${CryptoUtil.hmacHex(body, this._secret())}`, expiresIn: ttl };
  }
  /** @returns {{id,role,name}} atau melempar unauthorized */
  verify(token) {
    if (!token || typeof token !== 'string' || token.indexOf('.') < 0) throw Errors.unauthorized();
    const [body, sig] = token.split('.');
    if (!CryptoUtil.safeEqual(sig, CryptoUtil.hmacHex(body, this._secret()))) throw Errors.unauthorized();
    let payload;
    try { payload = JSON.parse(CryptoUtil.b64urlDecode(body)); } catch (e) { throw Errors.unauthorized(); }
    if (!payload.exp || payload.exp < Math.floor(Clock.nowMs() / 1000)) throw Errors.unauthorized();
    return { id: payload.sub, role: payload.role, name: payload.name };
  }
}
