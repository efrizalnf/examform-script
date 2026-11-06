/**
 * Utilitas kriptografi. Apps Script tidak menyediakan bcrypt/argon2, sehingga
 * kata sandi di-hash dengan HMAC-SHA256 menggunakan (salt per pengguna + pepper rahasia
 * di Script Properties). Pepper berada di luar spreadsheet sehingga bocornya sheet saja
 * tidak cukup untuk menyerang hash.
 */
const CryptoUtil = {
  toHex(bytes) {
    return bytes.map((b) => ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1)).join('');
  },
  hmacHex(message, key) {
    return this.toHex(Utilities.computeHmacSha256Signature(message, key));
  },
  /** Byte acak dari UUID v4 (sumber acak Google). */
  randomBytes(count) {
    const out = [];
    while (out.length < count) {
      const hex = Utilities.getUuid().replace(/-/g, '');
      for (let i = 0; i < hex.length && out.length < count; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    }
    return out;
  },
  /** String acak tanpa modulo-bias. */
  randomString(length, alphabet) {
    const n = alphabet.length;
    const limit = Math.floor(256 / n) * n;
    let out = '';
    while (out.length < length) {
      const bytes = this.randomBytes(length * 2);
      for (let i = 0; i < bytes.length && out.length < length; i++) {
        if (bytes[i] < limit) out += alphabet.charAt(bytes[i] % n);
      }
    }
    return out;
  },
  randomSalt() { return this.randomString(16, 'abcdef0123456789'); },
  /** Perbandingan waktu-konstan. */
  safeEqual(a, b) {
    a = String(a); b = String(b);
    let diff = a.length ^ b.length;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  },
  b64url(str) { return Utilities.base64EncodeWebSafe(str, Utilities.Charset.UTF_8).replace(/=+$/, ''); },
  b64urlDecode(str) {
    const pad = str + '==='.slice((str.length + 3) % 4);
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString('UTF-8');
  },
};
